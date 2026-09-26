/**
 * The nightly price pass (A12b).
 *
 * A full evaluation is expensive — fundamentals from EDGAR and Yahoo, paced by a
 * global rate limit — so the universe scan re-checks a name only about weekly.
 * But a price can fall 50% between two of those checks, and a 50% decline from a
 * company's own five-year high is the book's core entry signal. This pass exists
 * to catch that quickly and cheaply: it batch-quotes the large universe for price
 * and market cap only (finance-query's /v2/quotes, which takes many symbols per
 * request), and does two things with the answer.
 *
 *   1. **Triggers.** For a name that carries a stored five-year high from its
 *      last full evaluation, it recomputes the decline against today's price. If
 *      the name has just *crossed* the 45% or 50% line since that evaluation — not
 *      merely sits below it — the symbol goes on the scan's priority queue, and
 *      the 02:15 scan evaluates it in full first. Crossing, not level, is what
 *      stops a name hovering at −47% from eating the scan budget every night: once
 *      it is evaluated, its stored baseline moves down with it.
 *
 *   2. **Label healing.** Every quote carries a market cap, so the pass writes it
 *      back (in USD) to the universe row, the same self-heal the scan does (A1c) —
 *      but reaching names the scan's focus filter never visits, so a company that
 *      has grown past $10bn becomes findable. The focus names are priced every
 *      night (only they can trigger); the rest ride a rotation, since a market cap
 *      does not move fast enough to be worth a nightly quote.
 *
 * Market caps are written after each batch, so a run cut short by the execution
 * ceiling or a tripped breaker still keeps everything it had fetched.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { financeQueryProvider } from '@/lib/providers/financeQuery';
import { ProviderError } from '@/lib/providers/types';
import { createFxRates, capCurrency } from '@/lib/providers/fx';
import { writeMarketCaps, type MarketCapWrite } from './universeCaps';
import { enqueueForScan, type ScanQueueEntry } from './scanQueue';
import { applyScanScreen, SCAN_BANDS, SCAN_REGIONS } from './scan';
import { scanVenueFilter } from './scanQuery';
import { keepDistinctCompanies } from '@/lib/data/searchFilters';
import { isDueTonight } from './rotation';
import { sendPriceAlerts, type PriceAlert } from './priceAlerts';
import { priceTriggerOf } from '@/lib/data/priceTrigger';
import {
  DEFAULT_SECTOR_RULES,
  resolveFocusSector,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';

/** The two decline lines a crossing is queued on. */
export const CROSS_THRESHOLDS = [-0.45, -0.5] as const;

/** Symbols per /v2/quotes request. Verified to hold at 25 on the endpoint. */
export const PRICE_BATCH_SIZE = 25;

/** Non-focus large listings are covered once every this many nights. */
export const LABEL_ROTATION_LM = 7;

/** Mid caps are covered once every this many nights (upward label correction). */
export const LABEL_ROTATION_MID = 28;

export interface PricePassOptions {
  client: SupabaseClient;
  asOf?: string;
  batchSize?: number;
  /** Include the Mid Cap rotation (upward correction). On by default. */
  includeMid?: boolean;
  /** Skip the opt-in price-trigger emails (tests). */
  skipNotifications?: boolean;
  onProgress?: (message: string) => void;
}

export interface PricePassResult {
  /** Symbols in tonight's cohort (before quoting). */
  cohort: number;
  /** Quotes actually received. */
  priced: number;
  /** Universe market caps written back. */
  capsWritten: number;
  /** Names queued for a priority evaluation. */
  queued: string[];
  /** /v2/quotes requests made. */
  requests: number;
  /** True when the provider rate-limited us and the pass stood down early. */
  throttled: boolean;
  /** Cohort names that returned no quote this run (streak advanced toward retire). */
  retired: number;
}

interface StoredHigh {
  high: number;
  /** The decline at the last full evaluation, negative fraction. */
  prevDrawdown: number;
}

/**
 * The decline line a name has just crossed downward, or null.
 *
 * Crossing, not level: a name queues only when it was above a threshold at its
 * last full evaluation (`prev`) and is at or below it now (`curr`). A name that
 * was already past −50% and merely fell further does not re-queue — its baseline
 * moved down with it at that evaluation. The deepest line crossed wins, so a
 * single move through both −45% and −50% is reported as −50%.
 */
export function crossedThreshold(prev: number, curr: number): number | null {
  let crossed: number | null = null;
  for (const t of CROSS_THRESHOLDS) {
    if (prev > t && curr <= t) crossed = t;
  }
  return crossed;
}

function chunkList<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** A finance-query failure that is specifically the provider throttling us. */
function isRateLimit(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false;
  const cause = (error.cause as Error | undefined)?.message ?? '';
  return /\b429\b/.test(cause) || /rate.?limit|too many requests/i.test(cause + error.message);
}

async function loadRules(client: SupabaseClient): Promise<SectorRule[]> {
  const { data } = await client
    .from('sector_mapping')
    .select('symbol,sector,industry,focus_sector,specificity,is_excluded,is_payment_processor')
    .returns<
      Array<{
        symbol: string | null;
        sector: string | null;
        industry: string | null;
        focus_sector: FocusSector;
        specificity: number;
        is_excluded: boolean;
        is_payment_processor: boolean;
      }>
    >();
  return (data ?? []).length
    ? (data ?? []).map((r) => ({
        symbol: r.symbol ?? undefined,
        sector: r.sector ?? undefined,
        industry: r.industry ?? undefined,
        focusSector: r.focus_sector,
        specificity: r.specificity,
        isExcluded: r.is_excluded,
        isPaymentProcessor: r.is_payment_processor,
      }))
    : DEFAULT_SECTOR_RULES;
}

interface UniRow {
  symbol: string;
  name: string | null;
  exchange: string | null;
  country: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
}

/** A universe query builder, narrowed to the calls the pager makes. */
interface RowQuery {
  order: (column: string) => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: UniRow[] | null; error: { message: string } | null }>;
  };
}

/**
 * Every row matching a filtered universe query, paged past PostgREST's 1,000 row
 * cap. The `order('symbol')` is load-bearing: without a stable sort, paging
 * returns rows in an arbitrary order that overlaps and misses across pages.
 */
async function allRows(build: () => RowQuery): Promise<UniRow[]> {
  const out: UniRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build().order('symbol').range(from, from + page - 1);
    if (error) throw new Error(`universe query failed: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

const COHORT_COLS = 'symbol,name,exchange,country,sector,industry,currency';

export async function runPricePass(options: PricePassOptions): Promise<PricePassResult> {
  const { client, batchSize = PRICE_BATCH_SIZE, includeMid = true } = options;
  const log = options.onProgress ?? (() => {});
  const today = options.asOf ?? new Date().toISOString().slice(0, 10);
  const rules = await loadRules(client);

  // --- cohort --------------------------------------------------------------
  // One symbol per company throughout: each source is collapsed with the same
  // reducer the scan uses, so a company's cross-listings are not quoted several
  // times. Focus names every night (only they can trigger); the rest on a rotation.
  const focusRows = (await allRows(() =>
    applyScanScreen(client.from('universe').select(COHORT_COLS), rules),
  )).filter(
    (r) =>
      resolveFocusSector(rules, { symbol: r.symbol, sector: r.sector, industry: r.industry })
        .focusSector !== 'outside_focus',
  );
  const focus = new Set(keepDistinctCompanies(focusRows).map((r) => r.symbol));

  const lmCompanies = keepDistinctCompanies(
    await allRows(() =>
      client
        .from('universe')
        .select(COHORT_COLS)
        .in('region', SCAN_REGIONS)
        .in('market_cap_band', SCAN_BANDS)
        .eq('inactive', false)
        .or(scanVenueFilter()),
    ),
  ).map((r) => r.symbol);
  const nonFocusDue = lmCompanies.filter(
    (s) => !focus.has(s) && isDueTonight(s, today, LABEL_ROTATION_LM),
  );

  const midDue = includeMid
    ? keepDistinctCompanies(
        await allRows(() =>
          client
            .from('universe')
            .select(COHORT_COLS)
            .in('region', SCAN_REGIONS)
            .in('market_cap_band', ['Mid Cap'])
            .eq('inactive', false)
            .or(scanVenueFilter()),
        ),
      )
        .map((r) => r.symbol)
        .filter((s) => isDueTonight(s, today, LABEL_ROTATION_MID))
    : [];

  // Watched names are evaluated in full every night by the watchlist pass, so
  // they need neither a trigger nor a label refresh here.
  const { data: watchedRows } = await client
    .from('watchlist_items')
    .select('symbol')
    .returns<Array<{ symbol: string }>>();
  const watched = new Set((watchedRows ?? []).map((r) => r.symbol));

  const cohort = [...new Set([...focus, ...nonFocusDue, ...midDue])].filter((s) => !watched.has(s));
  log(
    `cohort ${cohort.length}: ${focus.size} focus, ${nonFocusDue.length} L/M rotation, ` +
      `${midDue.length} mid rotation (−${watched.size} watched)`,
  );

  // --- stored five-year highs, for the trigger -----------------------------
  // The high and the decline against it at the last full evaluation live on the
  // universe row (A12b), written back by the scan and watchlist for every name
  // they evaluate — not just suggested ones. Only names that carry one can
  // trigger; the focus universe fills in over a scan cycle.
  const highs = new Map<string, StoredHigh>();
  for (const symbols of chunkList(cohort, 500)) {
    const { data } = await client
      .from('universe')
      .select('symbol,price_high_5y,drawdown_5y')
      .in('symbol', symbols)
      .returns<Array<{ symbol: string; price_high_5y: number | null; drawdown_5y: number | null }>>();
    for (const row of data ?? []) {
      const high = row.price_high_5y;
      if (high == null || !Number.isFinite(high) || high <= 0 || row.drawdown_5y == null) continue;
      highs.set(row.symbol, { high, prevDrawdown: row.drawdown_5y });
    }
  }
  log(`${highs.size} of the cohort carry a stored five-year high (trigger-eligible)`);

  // Names subscribed to a price-trigger email (launch item 10): only these can
  // alert, and there are usually a handful, so this is a cheap read.
  const subscribed = new Map<string, string | null>();
  {
    const { data } = await client
      .from('watchlist_items')
      .select('symbol,name')
      .eq('price_alert', true)
      .returns<Array<{ symbol: string; name: string | null }>>();
    for (const r of data ?? []) subscribed.set(r.symbol, r.name);
  }
  const alertCandidates: PriceAlert[] = [];

  // --- quote, batch by batch -----------------------------------------------
  const fx = createFxRates();
  const queue: ScanQueueEntry[] = [];
  let priced = 0;
  let capsWritten = 0;
  let requests = 0;
  let throttled = false;

  // Which cohort names actually returned a price, so dead tickers can be retired.
  const quotedSymbols = new Set<string>();

  const chunks: string[][] = [];
  for (let i = 0; i < cohort.length; i += batchSize) chunks.push(cohort.slice(i, i + batchSize));

  for (const chunk of chunks) {
    requests++;
    let quotes;
    try {
      quotes = await financeQueryProvider.fetchPriceBatch(chunk);
    } catch (error) {
      if (isRateLimit(error)) {
        throttled = true;
        log(`provider rate-limited on batch ${requests}; standing down`);
        break;
      }
      log(`batch ${requests} failed (continuing): ${(error as Error).message}`);
      continue;
    }
    for (const q of quotes) if (q.price != null) quotedSymbols.add(q.symbol);
    priced += quotes.length;

    // Load any new currency→USD rates this batch needs, then write caps in USD.
    await fx.load(quotes.map((q) => [capCurrency(q.currency), 'USD'] as [string, string]));
    const caps: MarketCapWrite[] = quotes.map((q) => {
      const r = fx.rate(capCurrency(q.currency), 'USD');
      const usd = q.marketCap != null && r != null ? q.marketCap * r : null;
      return { symbol: q.symbol, marketCapUsd: usd };
    });
    capsWritten += await writeMarketCaps(client, caps);

    // Triggers: a name that crossed a decline line since its last evaluation.
    for (const q of quotes) {
      if (q.price == null) continue;
      const stored = highs.get(q.symbol);
      if (!stored) continue;
      const curr = q.price / stored.high - 1;
      const crossed = crossedThreshold(stored.prevDrawdown, curr);
      if (crossed != null) {
        queue.push({ symbol: q.symbol, reason: `crossed ${Math.round(crossed * 100)}%`, drawdown: curr });
      }
      // Crossing the 50% entry level is what a price-trigger subscriber asked to
      // hear about (launch item 10).
      if (crossed === -0.5 && subscribed.has(q.symbol)) {
        alertCandidates.push({
          symbol: q.symbol,
          name: subscribed.get(q.symbol) ?? null,
          asOf: today,
          price: q.price,
          trigger: stored.high * 0.5,
          currency: q.currency,
        });
      }
    }
  }

  const queuedSymbols = queue.map((q) => q.symbol);
  if (queue.length > 0) {
    await enqueueForScan(client, queue);
    log(`queued ${queue.length} for priority evaluation: ${queuedSymbols.join(', ')}`);
  }

  // Price-trigger emails (launch item 10). Only for subscribed names that crossed
  // the 50% line, and only where the last stored evaluation shows the decline was
  // the one condition still open — so "the last condition it was missing" is true.
  // Not on a throttled run: a stand-down is not evidence a price moved.
  if (!options.skipNotifications && !throttled && alertCandidates.length > 0) {
    type SigRow = { symbol: string; checklist: Parameters<typeof priceTriggerOf>[0]; as_of: string };
    const { data: sigs } = await client
      .from('signal_history')
      .select('symbol,checklist,as_of')
      .in('symbol', alertCandidates.map((a) => a.symbol))
      .order('as_of', { ascending: false })
      .returns<SigRow[]>();
    const latest = new Map<string, SigRow>();
    for (const r of sigs ?? []) if (!latest.has(r.symbol)) latest.set(r.symbol, r);

    // One email per event: if a "Checklist complete" alert already went out for a
    // symbol tonight (the watchlist scan runs before this pass), its price alert
    // would be a second mail about the same thing — so skip it (round 2, item 0).
    const { data: completed } = await client
      .from('notifications_log')
      .select('symbol')
      .eq('kind', 'buy_signal')
      .eq('as_of', today)
      .in('symbol', alertCandidates.map((a) => a.symbol))
      .returns<Array<{ symbol: string }>>();
    const alreadyAlerted = new Set((completed ?? []).map((r) => r.symbol));

    const toSend = alertCandidates.filter((a) => {
      if (alreadyAlerted.has(a.symbol)) return false;
      const sig = latest.get(a.symbol);
      return sig != null && priceTriggerOf(sig.checklist) != null;
    });
    if (toSend.length > 0) {
      await sendPriceAlerts(client, toSend, { onProgress: log });
      log(`price alerts for ${toSend.length}: ${toSend.map((a) => a.symbol).join(', ')}`);
    }
  }

  // Retire dead tickers (0043): advance the no-quote streak for cohort names that
  // returned nothing, reset the ones that quoted. Skip when the provider was
  // throttling us — a stand-down is not a dead company. Only names we actually
  // attempted (reached in a batch before any break) are judged.
  let retired = 0;
  if (!throttled) {
    const attempted = chunks.slice(0, requests).flat();
    const missed = attempted.filter((s) => !quotedSymbols.has(s));
    await client.rpc('mark_quote_results', { p_quoted: [...quotedSymbols], p_missed: missed });
    retired = missed.length;
    if (missed.length > 0) log(`no quote for ${missed.length} name(s); streaks advanced`);
  }
  log(`priced ${priced}, wrote ${capsWritten} caps, ${requests} requests`);

  return { cohort: cohort.length, priced, capsWritten, queued: queuedSymbols, requests, throttled, retired };
}
