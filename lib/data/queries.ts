/**
 * Server-side reads for the UI.
 *
 * These run under the signed-in user's session, so every query is subject to
 * RLS — including is_allowed_user(), which means a session for a de-whitelisted
 * address reads nothing even if its cookie is still valid. The service-role
 * client is reserved for the daily job and the import scripts.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { RatioColor, RatioKey } from '@/lib/ratios/engine';
import type { FocusSector } from '@/lib/sectors/mapping';
import type { WhyPart } from '@/lib/signal/explain';
import type { Position } from './position';
import { sanitiseOverrides } from '@/lib/ratios/editableThresholds';
import { buildTrend, windowStart, type Trend, type TrendPoint } from './trend';
import { dedupeByCompany, PRIMARY_EXCHANGE_CODES } from '@/lib/pipeline/scan';
import { rankUniverseMatches } from './rankMatches';
import type { Lang } from '@/lib/i18n/config';

export interface SignalRow {
  symbol: string;
  as_of: string;
  status: 'buy_worthy' | 'almost' | 'watching';
  lynch_category: string;
  focus_sector: FocusSector;
  conditions_met: number;
  conditions_applicable: number;
  peg_basis: string | null;
  checklist: Array<{
    key: string;
    applicable: boolean;
    passed: boolean;
    value: number | null;
    target: string;
    notApplicableReason?: string;
    detail: Record<string, unknown>;
  }>;
  why_en: string;
  why_nl: string;
  /** Tagged sentences; null on rows written before they were stored. */
  why_parts: { en: WhyPart[]; nl: WhyPart[] } | null;
  became_buy_worthy: boolean;
  previous_status: string | null;
}

export interface RatioRow {
  symbol: string;
  as_of: string;
  ratio_key: RatioKey;
  value: number | null;
  unit: 'ratio' | 'percent' | 'currency' | 'years';
  color: RatioColor;
  target_label: string;
  target_source: 'book' | 'app_default';
  currency: string | null;
  history: Array<{ period: string; value: number }>;
  not_applicable: boolean;
  unavailable_reason: string | null;
  detail: Record<string, unknown>;
  is_adjusted: boolean;
  raw_value: number | null;
}

export interface StatementPeriodRow {
  endDate: string;
  metrics: Record<string, number | null | undefined>;
}

export interface SnapshotRow {
  symbol: string;
  as_of: string;
  price: number | null;
  currency: string | null;
  market_cap_usd: number | null;
  quote: {
    name?: string | null;
    sector?: string | null;
    industry?: string | null;
    nextEarningsDate?: string | null;
    description?: string | null;
  } | null;
  price_history: Array<{ date: string; close: number }> | null;
  /**
   * Annual income and cash statements, newest period first.
   *
   * Loaded for the earnings-quality note, which needs per-share and
   * stock-compensation figures the ratio rows do not carry. Together they are
   * about 4kB against the 156kB of price history already in this query, so
   * the extra columns cost nothing worth measuring.
   */
  income_annual: { periods: StatementPeriodRow[] } | null;
  cash_annual: { periods: StatementPeriodRow[] } | null;
  estimates: {
    nextYearEps: number | null;
    nextYearEpsGrowth: number | null;
    analystCount: number | null;
    targetPrice: number | null;
    series: Array<{ fiscalYearEnd: string; eps: number | null; analystCount: number | null }>;
  } | null;
  filing_currency: string | null;
  statement_sources: Record<string, string | null> | null;
  estimates_source: string | null;
  is_stale: boolean;
  fetch_errors: string[] | null;
}

/**
 * Not cached across requests: each one carries its own session cookies, so a
 * shared client would leak one user's session into another's request.
 */
function client(): Promise<SupabaseClient> {
  return createClient();
}

/** The most recent signal per symbol. */
export async function getLatestSignals(): Promise<SignalRow[]> {
  const { data, error } = await (await client())
    .from('signal_history')
    .select('*')
    .order('as_of', { ascending: false })
    .returns<SignalRow[]>();

  if (error) throw new Error(error.message);

  const newest = new Map<string, SignalRow>();
  for (const row of data ?? []) if (!newest.has(row.symbol)) newest.set(row.symbol, row);

  // Buy-worthy first, then by how close the rest are.
  const rank = { buy_worthy: 0, almost: 1, watching: 2 } as const;
  return [...newest.values()].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      b.conditions_met / b.conditions_applicable -
        a.conditions_met / a.conditions_applicable ||
      a.symbol.localeCompare(b.symbol),
  );
}

export async function getSignal(symbol: string): Promise<SignalRow | null> {
  const { data } = await (await client())
    .from('signal_history')
    .select('*')
    .eq('symbol', symbol)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle<SignalRow>();
  return data ?? null;
}

export async function getRatios(symbol: string, asOf: string): Promise<RatioRow[]> {
  const { data } = await (await client())
    .from('ratios')
    .select('*')
    .eq('symbol', symbol)
    .eq('as_of', asOf)
    .returns<RatioRow[]>();
  return data ?? [];
}

export async function getSnapshot(symbol: string): Promise<SnapshotRow | null> {
  const { data } = await (await client())
    .from('daily_snapshots')
    .select(
      'symbol,as_of,price,currency,market_cap_usd,quote,price_history,estimates,' +
        'income_annual,cash_annual,' +
        'filing_currency,statement_sources,estimates_source,is_stale,fetch_errors',
    )
    .eq('symbol', symbol)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle<SnapshotRow>();
  return data ?? null;
}

export async function getCompanyNames(symbols: string[]): Promise<Map<string, string>> {
  if (symbols.length === 0) return new Map();
  const { data } = await (await client())
    .from('universe')
    .select('symbol,name')
    .in('symbol', symbols)
    .returns<Array<{ symbol: string; name: string | null }>>();
  return new Map((data ?? []).filter((r) => r.name).map((r) => [r.symbol, r.name as string]));
}

export interface Translation {
  name: string;
  target: string;
  explanation: string;
}

/**
 * Tooltip copy for one language, keyed `${namespace}:${key}`.
 *
 * Seeded from docs/ratios.<lang>.md, which stays the source of truth.
 */
export async function getTranslations(lang: Lang): Promise<Map<string, Translation>> {
  const { data } = await (await client())
    .from('translations')
    .select('namespace,key,field,value')
    .eq('lang', lang)
    .returns<Array<{ namespace: string; key: string; field: string; value: string }>>();

  const out = new Map<string, Translation>();
  for (const row of data ?? []) {
    const id = `${row.namespace}:${row.key}`;
    const entry = out.get(id) ?? { name: '', target: '', explanation: '' };
    if (row.field === 'name') entry.name = row.value;
    if (row.field === 'target') entry.target = row.value;
    if (row.field === 'explanation') entry.explanation = row.value;
    out.set(id, entry);
  }
  return out;
}

export interface ReviewRow {
  id: string;
  user_id: string;
  symbol: string;
  assessment: 'temporary' | 'structural' | 'not_assessed';
  catalysts: string[];
  sell_signals: string[];
  marks_answer: string | null;
  assessed_at: string | null;
  updated_at: string;
}

export interface NoteRow {
  review_id: string;
  user_id: string;
  note: string;
  noted_on: string;
}

/**
 * Every household member's review of one ticker, with their notes.
 *
 * RLS lets both members read each other's reviews but only write their own, so
 * this returns the full set and the caller separates "mine" from "theirs".
 */
export interface ReviewHistoryRow {
  id: string;
  symbol: string;
  assessment: 'temporary' | 'structural' | 'not_assessed';
  catalysts: string[];
  sell_signals: string[];
  marks_answer: string | null;
  saved_at: string;
}

export async function getReviews(
  symbol: string,
): Promise<{ reviews: ReviewRow[]; notes: NoteRow[]; history: ReviewHistoryRow[] }> {
  const supabase = await client();

  const { data: reviews } = await supabase
    .from('qualitative_reviews')
    .select('id,user_id,symbol,assessment,catalysts,sell_signals,marks_answer,assessed_at,updated_at')
    .eq('symbol', symbol)
    .returns<ReviewRow[]>();

  const { data: notes } = await supabase
    .from('qualitative_notes')
    .select('review_id,user_id,note,noted_on')
    .eq('symbol', symbol)
    .order('noted_on', { ascending: false })
    .returns<NoteRow[]>();

  // Own history only — RLS enforces that, and the query says the same thing so
  // the intent is readable without going to the policy.
  const { data: history } = await supabase
    .from('qualitative_review_history')
    .select('id,symbol,assessment,catalysts,sell_signals,marks_answer,saved_at')
    .eq('symbol', symbol)
    .order('saved_at', { ascending: false })
    .limit(20)
    .returns<ReviewHistoryRow[]>();

  return { reviews: reviews ?? [], notes: notes ?? [], history: history ?? [] };
}

export interface ReviewSummary {
  symbol: string;
  assessment: 'temporary' | 'structural' | 'not_assessed';
  assessed_at: string | null;
  updated_at: string;
}

/**
 * The signed-in member's own reviews, one per symbol.
 *
 * For the watchlist, which needs to say which names have been looked at without
 * loading each review in full. RLS already limits this to the caller's rows.
 */
export async function getMyReviewSummaries(): Promise<Map<string, ReviewSummary>> {
  const supabase = await client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Map();

  const { data } = await supabase
    .from('qualitative_reviews')
    .select('symbol,assessment,assessed_at,updated_at')
    .eq('user_id', user.id)
    .returns<ReviewSummary[]>();

  return new Map((data ?? []).map((row) => [row.symbol, row]));
}

export interface TickerSummary {
  symbol: string;
  lang: string;
  thesis: string;
  model: string | null;
  signal_as_of: string | null;
  generated_at: string;
}

/**
 * The cached AI thesis for one ticker, in one language.
 *
 * Each language is generated and cached on its own, so a missing Dutch summary
 * is a missing row rather than a reason to show the English one — the Dutch is
 * written as Dutch from the figures, never translated from a cached English
 * summary.
 */
export async function getTickerSummary(
  symbol: string,
  lang: string,
): Promise<TickerSummary | null> {
  const { data } = await (await client())
    .from('ticker_summaries')
    .select('symbol,lang,thesis,model,signal_as_of,generated_at')
    .eq('symbol', symbol)
    .eq('lang', lang)
    .maybeSingle<TickerSummary>();
  return data ?? null;
}

// --- the watchlist itself ----------------------------------------------------

export interface WatchlistEntry {
  symbol: string;
  name: string | null;
  focus_sector: FocusSector;
  outside_focus: boolean;
  added_via: string;
  /** Null until the nightly job has evaluated it. */
  signal: SignalRow | null;
}

/**
 * The watchlist, with each entry's latest signal if it has one.
 *
 * The page used to render `signal_history` directly, which happened to look
 * like the watchlist only because every seeded symbol had been analysed. The
 * two diverge the moment anything is added or removed: a newly added ticker has
 * no signal until the nightly job runs, and a removed one keeps its signal
 * rows — so adding appeared to do nothing and removing appeared to do nothing.
 * Membership decides what is listed; the signal only decides what each row says.
 */
export async function getWatchlist(): Promise<WatchlistEntry[]> {
  const supabase = await client();

  const { data: items, error } = await supabase
    .from('watchlist_items')
    .select('symbol,name,focus_sector,outside_focus,added_via')
    .returns<Omit<WatchlistEntry, 'signal'>[]>();
  if (error) throw new Error(error.message);

  const symbols = (items ?? []).map((i) => i.symbol);
  if (symbols.length === 0) return [];

  const { data: signals } = await supabase
    .from('signal_history')
    .select('*')
    .in('symbol', symbols)
    .order('as_of', { ascending: false })
    .returns<SignalRow[]>();

  const newest = new Map<string, SignalRow>();
  for (const row of signals ?? []) if (!newest.has(row.symbol)) newest.set(row.symbol, row);

  const rank = { buy_worthy: 0, almost: 1, watching: 2 } as const;
  return (items ?? [])
    .map((item) => ({ ...item, signal: newest.get(item.symbol) ?? null }))
    .sort((a, b) => {
      // Anything not yet evaluated sorts last: it has nothing to say yet.
      if (!a.signal || !b.signal) return (a.signal ? 0 : 1) - (b.signal ? 0 : 1);
      return (
        rank[a.signal.status] - rank[b.signal.status] ||
        b.signal.conditions_met / b.signal.conditions_applicable -
          a.signal.conditions_met / a.signal.conditions_applicable ||
        a.symbol.localeCompare(b.symbol)
      );
    });
}

/**
 * The stored evaluations for a set of tickers, lean enough to fetch for all of
 * them at once.
 *
 * `signal_history` has been written nightly since the beginning and never read
 * back. Only the four columns a trend needs are selected: the full rows carry a
 * checklist and two ratio snapshots each, which over a 90-day window across a
 * watchlist is megabytes to render one sparkline.
 */
export async function getTrends(symbols: string[], days = 90): Promise<Map<string, Trend>> {
  if (symbols.length === 0) return new Map();
  const supabase = await client();

  const { data, error } = await supabase
    .from('signal_history')
    .select('symbol,as_of,conditions_met,conditions_applicable,status')
    .in('symbol', symbols)
    .gte('as_of', windowStart(days))
    .order('as_of', { ascending: true })
    .returns<Array<TrendPoint & { symbol: string }>>();
  if (error) throw new Error(error.message);

  const bySymbol = new Map<string, TrendPoint[]>();
  for (const row of data ?? []) {
    const list = bySymbol.get(row.symbol) ?? [];
    list.push(row);
    bySymbol.set(row.symbol, list);
  }

  const trends = new Map<string, Trend>();
  for (const [symbol, points] of bySymbol) {
    const trend = buildTrend(symbol, points);
    if (trend) trends.set(symbol, trend);
  }
  return trends;
}

/**
 * One ticker's history, with the checklists, so the page can say which
 * conditions flipped rather than only how many.
 */
export async function getSignalHistory(symbol: string, days = 90): Promise<SignalRow[]> {
  const supabase = await client();

  const { data, error } = await supabase
    .from('signal_history')
    .select('symbol,as_of,status,conditions_met,conditions_applicable,checklist')
    .eq('symbol', symbol)
    .gte('as_of', windowStart(days))
    .order('as_of', { ascending: true })
    .returns<SignalRow[]>();
  if (error) throw new Error(error.message);

  return data ?? [];
}

export interface RecentDismissal {
  symbol: string;
  name: string | null;
  decided_at: string;
}

/**
 * A suggestion this member dismissed a moment ago.
 *
 * The undo cannot live on the card: the page is force-dynamic, so the very
 * render that follows the dismissal re-reads the rows, the card is no longer
 * pending, and anything inside it is unmounted before it can be read. Asking
 * the database what was just decided gives the page an undo that is rendered
 * from server state — it survives the re-render, works with JavaScript off, and
 * cannot expire before it is noticed the way a timed toast can.
 *
 * Five minutes, because this is a safety net for a mis-tap, not a history; the
 * dismissed tab is the durable record.
 */
export async function getRecentDismissal(withinMinutes = 5): Promise<RecentDismissal | null> {
  const supabase = await client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();

  const { data } = await supabase
    .from('suggestions')
    .select('symbol,name,decided_at')
    .eq('state', 'rejected')
    .eq('decided_by', user.id)
    .gte('decided_at', since)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle<RecentDismissal>();

  return data ?? null;
}

export interface ScreeningProvenance {
  /** Names in the universe that the scan's own filters would consider. */
  screened: number | null;
  /** The whole imported universe, for context on what that filter removed. */
  universe: number | null;
  /** The day the scan last raised a suggestion. */
  lastSuggestedAt: string | null;
}

/**
 * Where the suggestions came from.
 *
 * The page listed four cards with no denominator: no universe size, no scan
 * date, nothing saying what had been looked at to produce them. Four out of a
 * dozen and four out of six thousand are different claims, and the page was
 * making neither.
 *
 * The screened figure applies the scan's own filters — see `runScan`, which
 * walks `region in (US, Europe)`, `market_cap_band = Large Cap` and the primary
 * exchanges. Counted with `head`, so no rows cross the wire.
 */
export async function getScreeningProvenance(): Promise<ScreeningProvenance> {
  const supabase = await client();

  const [screened, universe, latest] = await Promise.all([
    supabase
      .from('universe')
      .select('symbol', { count: 'exact', head: true })
      .in('region', ['US', 'Europe'])
      .in('market_cap_band', ['Large Cap'])
      .in('exchange', PRIMARY_EXCHANGE_CODES),
    supabase.from('universe').select('symbol', { count: 'exact', head: true }),
    supabase
      .from('suggestions')
      .select('suggested_at')
      .order('suggested_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ suggested_at: string }>(),
  ]);

  return {
    screened: screened.count ?? null,
    universe: universe.count ?? null,
    lastSuggestedAt: latest.data?.suggested_at ?? null,
  };
}

/**
 * The signed-in member's holding in one ticker, if there is one.
 *
 * Per person: RLS restricts this to the caller's own rows, and the query says
 * the same thing so the intent is readable without going to the policy.
 */
export async function getPosition(symbol: string): Promise<Position | null> {
  const supabase = await client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('positions')
    .select('symbol,entry_price,entry_date,quantity,currency,note')
    .eq('symbol', symbol)
    .eq('user_id', user.id)
    .maybeSingle<Position>();

  return data ?? null;
}

/** Every symbol the member holds, for marking them on a list. */
export async function getHeldSymbols(): Promise<Set<string>> {
  const supabase = await client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data } = await supabase
    .from('positions')
    .select('symbol')
    .eq('user_id', user.id)
    .returns<Array<{ symbol: string }>>();

  return new Set((data ?? []).map((row) => row.symbol));
}

/**
 * Whether this member has been shown the primer.
 *
 * Its own tiny query rather than a field on `getSettings`, because the
 * watchlist asks this on every load and has no use for the rest of the row —
 * and because "no settings row yet" has to mean *not* onboarded, which is
 * the opposite of how `getSettings` treats an absent row for every other
 * field, where absent means "the default applies".
 */
export async function hasSeenPrimer(): Promise<boolean> {
  const supabase = await client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return true;

  const { data } = await supabase
    .from('settings')
    .select('onboarded_at')
    .eq('user_id', user.id)
    .maybeSingle<{ onboarded_at: string | null }>();

  return data?.onboarded_at != null;
}

/**
 * Ratio rows for the other watchlist names in a focus sector.
 *
 * Two hops because the sector lives on `signal_history` and the figures on
 * `ratios`, and there is no view joining them. Both are small — thirty-two
 * symbols — so this is two indexed reads rather than anything clever.
 *
 * Excludes the company itself: including its own figures would drag the
 * median towards the thing being measured.
 */
export async function getSectorPeerRatios(
  focusSector: string,
  asOf: string,
  excludeSymbol: string,
  ratioKeys: readonly string[],
): Promise<Array<{ symbol: string; ratioKey: string; value: number | null }>> {
  const supabase = await client();

  const { data: peers } = await supabase
    .from('signal_history')
    .select('symbol')
    .eq('as_of', asOf)
    .eq('focus_sector', focusSector)
    .neq('symbol', excludeSymbol)
    .returns<Array<{ symbol: string }>>();

  const symbols = (peers ?? []).map((p) => p.symbol);
  if (symbols.length === 0) return [];

  const { data } = await supabase
    .from('ratios')
    .select('symbol,ratio_key,value')
    .eq('as_of', asOf)
    .in('symbol', symbols)
    .in('ratio_key', [...ratioKeys])
    .returns<Array<{ symbol: string; ratio_key: string; value: number | null }>>();

  return (data ?? []).map((row) => ({
    symbol: row.symbol,
    ratioKey: row.ratio_key,
    value: row.value,
  }));
}

export interface MemberSettings {
  language: string | null;
  notify_email: string | null;
  notify_enabled: boolean;
  notify_on_buy: boolean;
  weekly_summary: boolean;
}

/**
 * The signed-in member's own settings row, with the defaults the table would
 * have applied if one existed.
 *
 * Absent is the normal state rather than an error: the row is created the first
 * time anything is saved, and until then the mailer falls back to NOTIFY_EMAILS.
 */
export async function getSettings(): Promise<MemberSettings> {
  const fallback: MemberSettings = {
    language: null,
    notify_email: null,
    notify_enabled: true,
    notify_on_buy: true,
    weekly_summary: true,
  };

  const supabase = await client();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fallback;

  const { data } = await supabase
    .from('settings')
    .select('language,notify_email,notify_enabled,notify_on_buy,weekly_summary')
    .eq('user_id', user.id)
    .maybeSingle<MemberSettings>();

  return data ?? fallback;
}

/**
 * The household's threshold overrides, sanitised.
 *
 * Household-wide: these decide the analysis, which is shared, so there is one
 * row and no question of whose numbers produced a signal.
 */
export async function getThresholdOverrides(): Promise<Record<string, Record<string, number>>> {
  const supabase = await client();
  const { data } = await supabase
    .from('analysis_settings')
    .select('thresholds')
    .maybeSingle<{ thresholds: unknown }>();

  return sanitiseOverrides(data?.thresholds).overrides;
}

/** Just the symbols, for marking search results as already added. */
export async function getWatchlistSymbols(): Promise<Set<string>> {
  const { data } = await (await client())
    .from('watchlist_items')
    .select('symbol')
    .returns<{ symbol: string }[]>();
  return new Set((data ?? []).map((r) => r.symbol));
}

// --- universe search ---------------------------------------------------------

export interface UniverseMatch {
  symbol: string;
  name: string | null;
  exchange: string | null;
  country: string | null;
  region: string | null;
  /** Already on the watchlist. */
  onWatchlist: boolean;
  /** Has been evaluated, so /stock/<symbol> will render. */
  analysed: boolean;
}

/**
 * Finds tickers by symbol or company name.
 *
 * Two things make the raw table unusable as a search index. It holds 102,285
 * rows with no index on `name`, so an unindexed substring match on a common
 * word took ~70 seconds (migration 0024 adds the trigram index that brings it
 * to ~140ms). And it lists every venue a company trades on, so "adobe" matches
 * ADB.BE, ADB.DE, ADB.DU and a dozen more lines of the same company — the
 * existing `dedupeByCompany` is what turns that back into one result per
 * business, and primary listings are preferred so the one that survives is the
 * one worth analysing.
 */
export async function searchUniverse(query: string, limit = 10): Promise<UniverseMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // PostgREST's or= filter is comma-separated, so a comma in the input would be
  // read as a filter separator rather than as text.
  const safe = trimmed.replace(/[,()*]/g, ' ').trim();
  if (safe.length < 2) return [];

  const supabase = await client();
  const { data } = await supabase
    .from('universe')
    .select('symbol,name,exchange,country,region')
    // Symbols are stored uppercase, so an uppercased case-sensitive prefix can
    // use the text_pattern_ops index (0025); ILIKE could not use any index and
    // scanned the whole table. Names go through the trigram index (0024).
    .or(`symbol.like.${safe.toUpperCase()}*,name.ilike.*${safe}*`)
    // Over-fetch: duplicates collapse below, and the listing worth showing may
    // not be in the first handful the index returns.
    .limit(120)
    .returns<Array<Omit<UniverseMatch, 'onWatchlist' | 'analysed'>>>();

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Venues the pipeline actually covers. This drops depositary receipts and
  // structured products — "FNB ETN on ADOBEC NOV25" is not a company anyone
  // wants to analyse — without hard-filtering on isPrimaryListing, which would
  // discard ASML: it trades on NASDAQ (NMS) while the company is Dutch, so the
  // exchange/country test says false for a perfectly real listing.
  const onKnownVenue = rows.filter(
    (r) => r.exchange && PRIMARY_EXCHANGE_CODES.includes(r.exchange.toUpperCase()),
  );
  const deduped = dedupeByCompany(onKnownVenue.length > 0 ? onKnownVenue : rows);

  const ranked = rankUniverseMatches(deduped, safe);

  const top = ranked.slice(0, limit);
  const symbols = top.map((r) => r.symbol);

  const [onWatchlist, { data: analysed }] = await Promise.all([
    getWatchlistSymbols(),
    supabase.from('signal_history').select('symbol').in('symbol', symbols).returns<{ symbol: string }[]>(),
  ]);
  const analysedSet = new Set((analysed ?? []).map((r) => r.symbol));

  return top.map((row) => ({
    ...row,
    onWatchlist: onWatchlist.has(row.symbol),
    analysed: analysedSet.has(row.symbol),
  }));
}
