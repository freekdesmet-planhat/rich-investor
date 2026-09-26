/**
 * The universe auto-scan (section 3.1, build step 10).
 *
 * Walks the focus sectors looking for tickers that already meet the
 * quantitative bar, and files them as suggestions for a person to accept or
 * dismiss. It never adds anything to the watchlist on its own — the book's
 * whole point is that the last step is a human judgement.
 *
 * Scope, and why it is bounded:
 *   * Focus sectors only, resolved through `sector_mapping` (section 4).
 *   * US first, Europe second; everything else excluded (book, chapter 2).
 *   * Large-cap band only, which approximates the $10bn floor without needing
 *     a live quote for all 6,797 candidates.
 *   * Already-watched tickers and live suggestions are skipped, as are
 *     dismissals still inside their 90-day window.
 *
 * Even so this is thousands of tickers, each needing fundamentals from EDGAR or
 * Yahoo, so the scan runs in batches with a limit rather than sweeping the whole
 * universe in one pass. `cursor` lets consecutive nightly runs pick up where the
 * last left off.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFxRates, capCurrency } from '@/lib/providers/fx';
import { createMarketDataService } from '@/lib/providers/marketData';
import { createSupabaseCache } from '@/lib/providers/supabaseCache';
import { DEFAULT_THRESHOLDS, mergeThresholds } from '@/lib/ratios/thresholds';
import { readThresholdOverrides } from './thresholdStore';
import { evaluateSymbol } from './evaluateSymbol';
import { writeMarketCaps, type MarketCapWrite } from './universeCaps';
import { clearFromScanQueue } from './scanQueue';
import {
  DEFAULT_SECTOR_RULES,
  resolveFocusSector,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';
import {
  focusSectorFilter,
  isPrimaryListing as isPrimaryListingRow,
  primaryListingFilter,
} from './scanQuery';

/** How long a dismissed ticker stays out of the feed (section 3.1). */
export const DISMISS_DAYS = 90;

/** The regions the scan walks, US first (book, chapter 2). */
export const SCAN_REGIONS = ['US', 'Europe'];

/**
 * The bands the scan screens. Large Cap approximates the $10bn floor without a
 * live quote; Mega Cap sits above it and was being skipped until A12 added it.
 */
export const SCAN_BANDS = ['Large Cap', 'Mega Cap'];

/**
 * Applies the scan's candidate screen — region, band, primary-listing pairing,
 * focus-sector superset — to a universe query.
 *
 * Both the scan's candidate fetch and the Suggestions "we check N companies"
 * count run through this one function, so the figure the page shows is the same
 * population the cursor walks and cannot drift from it. That drift is exactly
 * what produced the "3,422 screened" claim on the page while the scan only ever
 * evaluated a few hundred names in the focus sectors.
 */
/**
 * The `.in`/`.or` surface both callers' PostgREST builders share. The query is
 * cast to this minimal shape and back to `Q`, rather than constraining `Q`
 * against the builder itself — the builder's own recursive generics are what
 * make a self-referential constraint blow the type instantiation depth.
 */
interface FilterOps {
  in(column: string, values: readonly string[]): FilterOps;
  or(filters: string): FilterOps;
}

export function applyScanScreen<Q>(
  query: Q,
  rules: SectorRule[],
  options: { regions?: readonly string[]; bands?: readonly string[] } = {},
): Q {
  let q = (query as unknown as FilterOps)
    .in('region', options.regions ?? SCAN_REGIONS)
    .in('market_cap_band', options.bands ?? SCAN_BANDS)
    .or(primaryListingFilter());
  const focus = focusSectorFilter(rules);
  if (focus != null) q = q.or(focus);
  return q as unknown as Q;
}

/**
 * Rows fetched per candidate wanted. Most listings in the raw window are
 * secondary venues that get filtered out, so the page over-fetches; the atomic
 * cursor claim advances by this same multiple so parallel slices never overlap.
 */
export const SCAN_PAGE_MULTIPLIER = 2;

/** A quote provider telling us to slow down. Trips the circuit breaker. */
const RATE_LIMITED = /\b429\b|rate.?limit|too many requests|throttl/i;

/**
 * The venue table, the primary-listing test and the query builders all live in
 * scanQuery.ts now, because the filters they describe run in the database.
 * Re-exported here so the rest of the app keeps its existing import.
 */
export {
  PRIMARY_EXCHANGES,
  PRIMARY_EXCHANGE_CODES,
  isPrimaryListing,
} from './scanQuery';

/**
 * Preference between venues of the same country, lowest first.
 *
 * The country test cannot separate a company's main line from a secondary one
 * at home: Adidas is a German company on XETRA (ADS.DE), Frankfurt (ADS.F) and
 * Frankfurt floor (ADS1.F), and all three pass. Scanning them produces three
 * suggestions for one company. Ranking the venues and keeping one listing per
 * company is what actually resolves it.
 */
const EXCHANGE_PRIORITY: Record<string, number> = {
  NMS: 0, NYQ: 0, NGM: 1, ASE: 2, PCX: 3,
  AMS: 0, PAR: 0, EBS: 0, MIL: 0, MCE: 0, STO: 0,
  CPH: 0, HEL: 0, OSL: 0, BRU: 0, LIS: 0, VIE: 0, LSE: 0, ISE: 0,
  GER: 0, // XETRA, Germany's main venue
  FRA: 5, // Frankfurt floor and its duplicates
};

/**
 * Keeps one listing per company.
 *
 * FinanceDatabase has no issuer identifier, so the company is identified by
 * name and country — which is exactly what the duplicate listings share. Ties
 * break on venue rank, then on the shorter symbol, since a secondary line tends
 * to carry a suffix (ADS1.F against ADS.F).
 */
export function dedupeByCompany<
  T extends { symbol: string; name: string | null; exchange: string | null; country: string | null },
>(rows: T[]): T[] {
  const best = new Map<string, T>();

  for (const row of rows) {
    const key = `${(row.name ?? row.symbol).trim().toLowerCase()}|${row.country ?? ''}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      continue;
    }

    const rank = (r: T) => EXCHANGE_PRIORITY[(r.exchange ?? '').toUpperCase()] ?? 9;
    if (
      rank(row) < rank(current) ||
      (rank(row) === rank(current) && row.symbol.length < current.symbol.length)
    ) {
      best.set(key, row);
    }
  }

  return [...best.values()];
}

export interface ScanOptions {
  client: SupabaseClient;
  /** How many candidates to evaluate this run (the cursor walk). */
  limit?: number;
  /** Skip this many candidates first, so nightly runs advance through the list. */
  cursor?: number;
  regions?: string[];
  marketCapBands?: string[];
  /**
   * Names the price pass flagged (A12b), evaluated before the cursor walk and
   * regardless of the focus/band filters — a crossing is worth a look whatever
   * sector the name sits in. They are removed from `scan_queue` once evaluated.
   * The caller sizes `limit` to the budget left after these.
   */
  prioritySymbols?: string[];
  onProgress?: (message: string) => void;
}

export interface ScanResult {
  evaluated: number;
  suggested: number;
  skipped: number;
  /** Where the next run should resume. */
  nextCursor: number;
  /** True when this batch ran off the end of the screened universe. */
  exhausted: boolean;
  /** True when the quote provider was rate-limiting this batch. */
  throttled: boolean;
  candidates: Array<{ symbol: string; status: string; conditionsMet: number }>;
}

interface UniverseRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  country: string | null;
}

export async function runScan(options: ScanOptions): Promise<ScanResult> {
  const {
    client,
    limit = 40,
    cursor = 0,
    regions = SCAN_REGIONS,
    marketCapBands = SCAN_BANDS,
    prioritySymbols = [],
    onProgress,
  } = options;
  const log = onProgress ?? (() => {});
  const today = new Date().toISOString().slice(0, 10);

  // --- rules ---------------------------------------------------------------
  const { data: mapRows } = await client
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

  const rules: SectorRule[] = (mapRows ?? []).length
    ? (mapRows ?? []).map((r) => ({
        symbol: r.symbol ?? undefined,
        sector: r.sector ?? undefined,
        industry: r.industry ?? undefined,
        focusSector: r.focus_sector,
        specificity: r.specificity,
        isExcluded: r.is_excluded,
        isPaymentProcessor: r.is_payment_processor,
      }))
    : DEFAULT_SECTOR_RULES;

  // --- what to leave alone -------------------------------------------------
  const [{ data: watched }, { data: existing }] = await Promise.all([
    client.from('watchlist_items').select('symbol').returns<Array<{ symbol: string }>>(),
    client
      .from('suggestions')
      .select('symbol,state,rejected_until')
      .returns<Array<{ symbol: string; state: string; rejected_until: string | null }>>(),
  ]);

  const exclude = new Set((watched ?? []).map((r) => r.symbol));
  for (const row of existing ?? []) {
    if (row.state === 'pending' || row.state === 'accepted') {
      exclude.add(row.symbol);
      continue;
    }
    // A dismissal only expires once its 90-day window has passed.
    if (row.state === 'rejected' && (!row.rejected_until || row.rejected_until > today)) {
      exclude.add(row.symbol);
    }
  }

  // Exclude the *company*, not just the ticker. Adidas trades as ADS.DE, ADS.F
  // and ADS1.F, so suggesting one and then another is suggesting the same
  // company twice under a different symbol.
  const excludedCompanies = new Set<string>();
  if (exclude.size > 0) {
    const { data: excludedRows } = await client
      .from('universe')
      .select('name,country')
      .in('symbol', [...exclude])
      .returns<Array<{ name: string | null; country: string | null }>>();

    for (const row of excludedRows ?? []) {
      if (row.name) excludedCompanies.add(`${row.name.trim().toLowerCase()}|${row.country ?? ''}`);
    }
  }

  // --- priority names (A12b queue drain) -----------------------------------
  // The price pass flags names that just crossed a decline line; the scan
  // evaluates them first and regardless of the focus/band screen — a crossing is
  // worth a look whatever sector the name is in. The caller has already sized
  // `limit` to the budget left after these.
  let priorityCandidates: UniverseRow[] = [];
  if (prioritySymbols.length > 0) {
    const { data: priorityRows, error: priorityError } = await client
      .from('universe')
      .select('symbol,name,sector,industry,exchange,country')
      .in('symbol', prioritySymbols)
      .returns<UniverseRow[]>();
    if (priorityError) throw new Error(`priority query failed: ${priorityError.message}`);
    priorityCandidates = priorityRows ?? [];
  }

  // --- cursor candidates ---------------------------------------------------
  //
  // Both filters run in the database. They used to run here, over a page that
  // was 92% rows destined to be discarded — and since the cursor counts rows
  // consumed, that 92% also set the pace at which the scan crawled through the
  // universe. See scanQuery.ts for what each filter can and cannot express.
  const focusFilter = focusSectorFilter(rules);
  if (limit > 0 && focusFilter == null) {
    log('no inclusive sector rules configured: scanning without a focus filter');
  }

  let universeRows: UniverseRow[] = [];
  let consumed = 0;
  const cursorCandidates: UniverseRow[] = [];

  if (limit > 0) {
    // `limit * 2`, where it used to be `limit * 6`. The page is now mostly
    // candidates, so the headroom only has to cover the exact focus check and
    // the de-duplication of a company's remaining listings.
    const pageEnd = cursor + limit * SCAN_PAGE_MULTIPLIER;

    // The region/band/primary-pairing/focus screen, shared with the Suggestions
    // provenance count (applyScanScreen) so the page's "we check N" figure is
    // the same population this cursor walks.
    const query = applyScanScreen(
      client.from('universe').select('symbol,name,sector,industry,exchange,country'),
      rules,
      { regions, bands: marketCapBands },
    );

    const { data, error: universeError } = await query
      .order('symbol')
      .range(cursor, pageEnd)
      .returns<UniverseRow[]>();

    // Surfaced rather than swallowed. A malformed filter comes back as a
    // PostgREST error and an empty `data`, indistinguishable from "reached the
    // end" — the exact shape of silence this whole change exists to remove.
    if (universeError) throw new Error(`universe query failed: ${universeError.message}`);
    universeRows = data ?? [];

    const eligible: UniverseRow[] = [];
    for (const row of universeRows) {
      consumed++;
      if (exclude.has(row.symbol)) continue;
      // Narrower re-checks of what the query already did: the primary-listing
      // test is exact in SQL, and the focus test is the authoritative
      // most-specific-rule-wins resolution over a SQL superset.
      if (!isPrimaryListingRow(row.exchange, row.country)) continue;
      const focus = resolveFocusSector(rules, {
        symbol: row.symbol,
        sector: row.sector,
        industry: row.industry,
      });
      if (focus.focusSector === 'outside_focus') continue;
      if (excludedCompanies.has(`${(row.name ?? '').trim().toLowerCase()}|${row.country ?? ''}`)) {
        continue;
      }
      eligible.push(row);
    }
    // De-duplicate before applying the limit, so the batch is `limit` companies
    // rather than `limit` listings of rather fewer companies.
    cursorCandidates.push(...dedupeByCompany(eligible).slice(0, limit));
  }

  // Priority names first, then the cursor walk; a name in both appears once.
  const seen = new Set<string>();
  const candidates: UniverseRow[] = [];
  for (const row of [...priorityCandidates, ...cursorCandidates]) {
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);
    candidates.push(row);
  }

  // The cursor ran off the end of the screened set — only meaningful when we
  // actually walked it this run. Without the wrap the cursor sticks there for
  // good: `cursor + 0` is `cursor`, every night, forever.
  const exhausted = limit > 0 && universeRows.length === 0 && cursor > 0;
  if (exhausted) log(`reached the end of the screened universe at ${cursor}; starting over`);

  log(
    `scanning ${candidates.length} candidates from cursor ${cursor} ` +
      `(${priorityCandidates.length} priority, ${consumed} rows read)`,
  );

  if (candidates.length === 0) {
    // Clear any priority names we were handed but could not resolve, so they do
    // not clog the queue forever.
    if (prioritySymbols.length > 0) await clearFromScanQueue(client, prioritySymbols);
    return {
      evaluated: 0,
      suggested: 0,
      skipped: 0,
      nextCursor: exhausted ? 0 : cursor + consumed,
      exhausted,
      throttled: false,
      candidates: [],
    };
  }

  // --- evaluate ------------------------------------------------------------
  // Estimates are skipped: FMP allows ~250 requests a day and the scan covers
  // far more tickers than that. Suggestions are judged on realised figures, and
  // the forward PEG is added once a ticker reaches the watchlist.
  const service = createMarketDataService({
    cache: createSupabaseCache(client),
    skipEstimates: true,
  });

  const symbols = candidates.map((c) => c.symbol);
  const bundles = await service.getBundles(symbols, '5y');

  // Circuit-breaker signal: if the provider rate-limited a real share of this
  // batch, say so, and the route trips the breaker so the night's later slices
  // stop calling it. Half the batch, or five outright, is well past noise.
  const rateLimited = [...bundles.values()].filter((b) =>
    (b.errors ?? []).some((e) => RATE_LIMITED.test(e)),
  ).length;
  const throttled = symbols.length > 0 && (rateLimited >= 5 || rateLimited / symbols.length >= 0.5);
  if (throttled) log(`provider rate-limited ${rateLimited} of ${symbols.length} — signalling the breaker`);

  const fx = createFxRates();
  const pairs: Array<[string, string]> = [];
  for (const bundle of bundles.values()) {
    const quote = bundle.quote?.currency;
    if (!quote) continue;
    if (bundle.filingCurrency) pairs.push([quote, bundle.filingCurrency]);
    pairs.push([quote, 'USD']);
    // The cap converts on the major-unit rate (GBp cap is in GBP), so load it too.
    pairs.push([capCurrency(quote), 'USD']);
  }
  await fx.load(pairs);

  // The household's thresholds, resolved exactly as the nightly watchlist does.
  // The scan used to judge every candidate against the app defaults, so a
  // customised threshold changed what you watched but not what was suggested;
  // now both paths run on the same numbers.
  const stored = await readThresholdOverrides(client);
  const thresholds = Object.keys(stored ?? {}).length > 0
    ? mergeThresholds(stored as Record<string, unknown>)
    : DEFAULT_THRESHOLDS;

  const rows: Record<string, unknown>[] = [];
  // A suggested candidate's stock page reads signal_history and ratios, so the
  // scan persists both for the names it raises — see the note by the upserts.
  const ratioRows: Record<string, unknown>[] = [];
  const capUpdates: MarketCapWrite[] = [];
  const signalRows: Record<string, unknown>[] = [];
  const summary: ScanResult['candidates'] = [];
  let evaluated = 0;

  for (const candidate of candidates) {
    const bundle = bundles.get(candidate.symbol);
    if (!bundle || bundle.quote?.price == null) continue;
    evaluated++;

    // The one evaluation path both pipelines run — same maths, same thresholds,
    // same row shapes. See evaluateSymbol.ts.
    const result = evaluateSymbol({
      symbol: candidate.symbol,
      name: candidate.name,
      sector: candidate.sector,
      industry: candidate.industry,
      bundle,
      rules,
      thresholds,
      fx,
      asOf: today,
      // A scanned candidate has no watchlist history to compare against.
      previousStatus: null,
    });

    summary.push({
      symbol: candidate.symbol,
      status: result.signal.status,
      conditionsMet: result.signal.conditionsMet,
    });
    // Every evaluated candidate refreshes its cached USD cap and five-year high,
    // not just the suggested ones, so the whole screened universe self-heals over a
    // cycle (A1c) and the price pass has a high to trigger against (A12b).
    capUpdates.push({
      symbol: candidate.symbol,
      marketCapUsd: result.marketCapUsd,
      priceHigh5y: result.priceHigh5y,
      drawdown5y: result.drawdown5y,
    });

    // Only genuinely interesting names become suggestions. Everything else is
    // simply not raised — the feed is for things worth a decision.
    if (result.signal.status !== 'buy_worthy' && result.signal.status !== 'almost') continue;

    rows.push({
      user_id: null,
      symbol: candidate.symbol,
      name: candidate.name,
      focus_sector: result.focusSector,
      state: 'pending',
      status: result.signal.status,
      why_en: result.explanation.en,
      why_nl: result.explanation.nl,
      ratio_snapshot: result.signal.ratioSnapshot,
      suggested_at: today,
    });

    // Persist the evaluation for the suggested names only. The stock page the
    // feed links to resolves a symbol through signal_history and ratios; without
    // these it 404s, however good the suggestion card looks. The rows are built
    // by the same shared builder the watchlist uses, so they cannot drift.
    ratioRows.push(...result.ratioRows);
    signalRows.push(result.signalRow);
  }

  if (rows.length > 0) {
    const { error } = await client.from('suggestions').upsert(rows, { onConflict: 'symbol' });
    if (error) throw new Error(`suggestions upsert failed: ${error.message}`);
  }

  if (ratioRows.length > 0) {
    const { error } = await client
      .from('ratios')
      .upsert(ratioRows, { onConflict: 'symbol,as_of,ratio_key' });
    if (error) throw new Error(`ratios upsert failed: ${error.message}`);
  }

  if (signalRows.length > 0) {
    const { error } = await client
      .from('signal_history')
      .upsert(signalRows, { onConflict: 'symbol,as_of' });
    if (error) throw new Error(`signal_history upsert failed: ${error.message}`);
  }

  const capsWritten = await writeMarketCaps(client, capUpdates);
  if (capsWritten > 0) log(`refreshed ${capsWritten} universe market caps`);

  // The priority names have now had their full evaluation, so they leave the
  // queue whether or not they became suggestions. A name still crossing the line
  // will simply be re-queued by the next price pass — measured against its now
  // freshly-stored baseline, so only a further decline re-triggers it.
  if (prioritySymbols.length > 0) await clearFromScanQueue(client, prioritySymbols);

  log(`evaluated ${evaluated}, suggested ${rows.length}`);

  return {
    evaluated,
    suggested: rows.length,
    skipped: candidates.length - evaluated,
    nextCursor: exhausted ? 0 : cursor + consumed,
    exhausted,
    throttled,
    candidates: summary,
  };
}
