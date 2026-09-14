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
export async function getReviews(
  symbol: string,
): Promise<{ reviews: ReviewRow[]; notes: NoteRow[] }> {
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

  return { reviews: reviews ?? [], notes: notes ?? [] };
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
