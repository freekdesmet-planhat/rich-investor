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
import { createFxRates } from '@/lib/providers/fx';
import { createMarketDataService } from '@/lib/providers/marketData';
import { createSupabaseCache } from '@/lib/providers/supabaseCache';
import { buildContext, computeAllRatios } from '@/lib/ratios/engine';
import { DEFAULT_THRESHOLDS } from '@/lib/ratios/thresholds';
import { evaluateSignal } from '@/lib/signal/buyWorthy';
import { explainSignal } from '@/lib/signal/explain';
import { classifyLynch, pegCategoryFor } from '@/lib/signal/lynch';
import {
  DEFAULT_SECTOR_RULES,
  resolveFocusSector,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';

/** How long a dismissed ticker stays out of the feed (section 3.1). */
export const DISMISS_DAYS = 90;

/**
 * Primary listing venues, mapped to the country whose companies they host.
 *
 * FinanceDatabase carries every venue a company trades on, so a large-cap
 * filter over US and Europe is dominated by cross-listings rather than
 * companies: of the first batch scanned, 096.F was a US company on Frankfurt,
 * 0A46.L a US company on the LSE, and 0G8C.IL a Norwegian company on the
 * International Order Book. Analysing those is duplicated work against a
 * thinner order book than the primary line.
 *
 * A listing counts as primary when its venue's country matches the company's,
 * which filters cross-listings without needing an issuer identifier the dataset
 * does not carry.
 */
const PRIMARY_EXCHANGES: Record<string, string> = {
  NMS: 'United States',
  NYQ: 'United States',
  NGM: 'United States',
  ASE: 'United States',
  PCX: 'United States',
  AMS: 'Netherlands',
  PAR: 'France',
  EBS: 'Switzerland',
  GER: 'Germany',
  FRA: 'Germany',
  MIL: 'Italy',
  MCE: 'Spain',
  STO: 'Sweden',
  CPH: 'Denmark',
  HEL: 'Finland',
  OSL: 'Norway',
  BRU: 'Belgium',
  LIS: 'Portugal',
  VIE: 'Austria',
  LSE: 'United Kingdom',
  ISE: 'Ireland',
};

export function isPrimaryListing(exchange: string | null, country: string | null): boolean {
  if (!exchange || !country) return false;
  return PRIMARY_EXCHANGES[exchange.toUpperCase()] === country;
}

/** Venue codes worth querying at all, so the page is not spent on noise. */
export const PRIMARY_EXCHANGE_CODES = Object.keys(PRIMARY_EXCHANGES);

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
  /** How many candidates to evaluate this run. */
  limit?: number;
  /** Skip this many candidates first, so nightly runs advance through the list. */
  cursor?: number;
  regions?: string[];
  marketCapBands?: string[];
  onProgress?: (message: string) => void;
}

export interface ScanResult {
  evaluated: number;
  suggested: number;
  skipped: number;
  /** Where the next run should resume. */
  nextCursor: number;
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
    regions = ['US', 'Europe'],
    marketCapBands = ['Large Cap'],
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

  // --- candidates ----------------------------------------------------------
  const { data: universe } = await client
    .from('universe')
    .select('symbol,name,sector,industry,exchange,country')
    .in('region', regions)
    .in('market_cap_band', marketCapBands)
    // Narrowed in the query rather than in memory: PostgREST returns at most
    // 1000 rows per request, and cross-listings so outnumber primary lines that
    // a whole page could otherwise yield two candidates.
    .in('exchange', PRIMARY_EXCHANGE_CODES)
    .order('symbol')
    .range(cursor, cursor + limit * 6)
    .returns<UniverseRow[]>();

  const eligible: UniverseRow[] = [];
  let consumed = 0;

  for (const row of universe ?? []) {
    consumed++;
    if (exclude.has(row.symbol)) continue;
    if (!isPrimaryListing(row.exchange, row.country)) continue;
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
  const candidates = dedupeByCompany(eligible).slice(0, limit);

  log(`scanning ${candidates.length} candidates from cursor ${cursor}`);
  if (candidates.length === 0) {
    return { evaluated: 0, suggested: 0, skipped: 0, nextCursor: cursor + consumed, candidates: [] };
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

  const fx = createFxRates();
  const pairs: Array<[string, string]> = [];
  for (const bundle of bundles.values()) {
    const quote = bundle.quote?.currency;
    if (!quote) continue;
    if (bundle.filingCurrency) pairs.push([quote, bundle.filingCurrency]);
    pairs.push([quote, 'USD']);
  }
  await fx.load(pairs);

  const rows: Record<string, unknown>[] = [];
  const summary: ScanResult['candidates'] = [];
  let evaluated = 0;

  for (const candidate of candidates) {
    const bundle = bundles.get(candidate.symbol);
    if (!bundle || bundle.quote?.price == null) continue;
    evaluated++;

    const focus = resolveFocusSector(rules, {
      symbol: candidate.symbol,
      sector: candidate.sector,
      industry: candidate.industry,
    });

    const ctx = buildContext(bundle, {
      focusSector: focus.focusSector,
      isPaymentProcessor: focus.isPaymentProcessor,
      thresholds: DEFAULT_THRESHOLDS,
      fx,
    });

    const lynch = classifyLynch(ctx, { industry: candidate.industry });
    const ratios = computeAllRatios(ctx, pegCategoryFor(lynch.category));
    const signal = evaluateSignal(ctx, ratios, lynch.category);

    summary.push({
      symbol: candidate.symbol,
      status: signal.status,
      conditionsMet: signal.conditionsMet,
    });

    // Only genuinely interesting names become suggestions. Everything else is
    // simply not raised — the feed is for things worth a decision.
    if (signal.status !== 'buy_worthy' && signal.status !== 'almost') continue;

    const why = explainSignal({
      symbol: candidate.symbol,
      name: candidate.name,
      signal,
      ratios,
    });

    rows.push({
      user_id: null,
      symbol: candidate.symbol,
      name: candidate.name,
      focus_sector: focus.focusSector,
      state: 'pending',
      status: signal.status,
      why_en: why.en,
      why_nl: why.nl,
      ratio_snapshot: signal.ratioSnapshot,
      suggested_at: today,
    });
  }

  if (rows.length > 0) {
    const { error } = await client.from('suggestions').upsert(rows, { onConflict: 'symbol' });
    if (error) throw new Error(`suggestions upsert failed: ${error.message}`);
  }

  log(`evaluated ${evaluated}, suggested ${rows.length}`);

  return {
    evaluated,
    suggested: rows.length,
    skipped: candidates.length - evaluated,
    nextCursor: cursor + consumed,
    candidates: summary,
  };
}
