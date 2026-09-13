/**
 * The daily pipeline (build step 7, without the email step).
 *
 * Wires the provider layer, ratio engine, Lynch classification, signal logic
 * and explanation generator into one pass over a list of tickers, and persists
 * the result to `daily_snapshots`, `ratios` and `signal_history`.
 *
 * Everything a signal was decided on is stored with it — the ratio snapshot,
 * the thresholds in force and the generated explanation in both languages — so
 * a historical signal keeps its original reasoning even after thresholds or
 * figures change (section 7).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFxRates } from '@/lib/providers/fx';
import { createMarketDataService, type SymbolBundle } from '@/lib/providers/marketData';
import { createSupabaseCache } from '@/lib/providers/supabaseCache';
import { buildContext, computeAllRatios, type RatioResult } from '@/lib/ratios/engine';
import { checkInvariants, formatViolations, type InvariantViolation } from '@/lib/ratios/invariants';
import { DEFAULT_THRESHOLDS, mergeThresholds } from '@/lib/ratios/thresholds';
import { evaluateSignal, type SignalStatus } from '@/lib/signal/buyWorthy';
import { explainSignal } from '@/lib/signal/explain';
import { classifyLynch, pegCategoryFor } from '@/lib/signal/lynch';
import {
  DEFAULT_SECTOR_RULES,
  resolveFocusSector,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';

export interface PipelineOptions {
  client: SupabaseClient;
  symbols: string[];
  /** User threshold overrides from `settings.thresholds`. */
  thresholdOverrides?: Record<string, unknown>;
  /** Skip estimate lookups; the universe-wide scan sets this. */
  skipEstimates?: boolean;
  onProgress?: (message: string) => void;
}

export interface PipelineRow {
  symbol: string;
  status: SignalStatus;
  previousStatus: SignalStatus | null;
  becameBuyWorthy: boolean;
  conditionsMet: number;
  conditionsApplicable: number;
  pegBasis: string;
  focusSector: FocusSector;
  lynchCategory: string;
  whyEn: string;
  whyNl: string;
  isStale: boolean;
  errors: string[];
  /** Arithmetic invariants this ticker broke, if any. Never silent. */
  violations: InvariantViolation[];
}

interface MappingRow {
  symbol: string | null;
  sector: string | null;
  industry: string | null;
  focus_sector: FocusSector;
  specificity: number;
  is_excluded: boolean;
  is_payment_processor: boolean;
}

interface UniverseRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
}

/** Banks and insurers, whose ratios mean something different (section 6.6). */
function isFinancialInstitution(sector: string | null, industry: string | null): boolean {
  if (sector !== 'Financials') return false;
  return /bank|insurance|thrift/i.test(industry ?? '');
}

export async function runDailyPipeline(options: PipelineOptions): Promise<PipelineRow[]> {
  const { client, symbols, thresholdOverrides, skipEstimates = false, onProgress } = options;
  const log = onProgress ?? (() => {});
  const asOf = new Date().toISOString().slice(0, 10);

  // --- reference data -------------------------------------------------------
  const { data: mapRows } = await client
    .from('sector_mapping')
    .select('symbol,sector,industry,focus_sector,specificity,is_excluded,is_payment_processor')
    .returns<MappingRow[]>();

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

  const { data: universeRows } = await client
    .from('universe')
    .select('symbol,name,sector,industry')
    .in('symbol', symbols)
    .returns<UniverseRow[]>();

  const universe = new Map((universeRows ?? []).map((r) => [r.symbol, r]));

  // --- previous statuses, to detect the crossing into buy-worthy ------------
  const { data: previousRows } = await client
    .from('signal_history')
    .select('symbol,status,as_of')
    .in('symbol', symbols)
    .lt('as_of', asOf)
    .order('as_of', { ascending: false })
    .returns<Array<{ symbol: string; status: SignalStatus; as_of: string }>>();

  const previousStatus = new Map<string, SignalStatus>();
  for (const row of previousRows ?? []) {
    if (!previousStatus.has(row.symbol)) previousStatus.set(row.symbol, row.status);
  }

  // --- market data ----------------------------------------------------------
  log(`fetching ${symbols.length} tickers`);
  const service = createMarketDataService({
    cache: createSupabaseCache(client),
    skipEstimates,
  });
  const bundles = await service.getBundles(symbols, '5y');

  // --- FX, in one batch -----------------------------------------------------
  const pairs: Array<[string, string]> = [];
  for (const bundle of bundles.values()) {
    const quote = bundle.quote?.currency;
    if (!quote) continue;
    if (bundle.filingCurrency) pairs.push([quote, bundle.filingCurrency]);
    pairs.push([quote, 'USD']);
  }
  const fx = createFxRates();
  await fx.load(pairs);

  const thresholds = thresholdOverrides
    ? mergeThresholds(thresholdOverrides)
    : DEFAULT_THRESHOLDS;

  const rows: PipelineRow[] = [];
  const ratioRows: Record<string, unknown>[] = [];
  const signalRows: Record<string, unknown>[] = [];
  const allViolations: InvariantViolation[] = [];

  for (const symbol of symbols) {
    const bundle = bundles.get(symbol);
    if (!bundle) {
      log(`${symbol}: no data`);
      continue;
    }

    const meta = universe.get(symbol);
    const resolved = resolveFocusSector(rules, {
      symbol,
      sector: meta?.sector ?? null,
      industry: meta?.industry ?? null,
    });

    const ctx = buildContext(bundle, {
      focusSector: resolved.focusSector,
      isFinancial: isFinancialInstitution(meta?.sector ?? null, meta?.industry ?? null),
      isPaymentProcessor: resolved.isPaymentProcessor,
      thresholds,
      fx,
    });

    const lynch = classifyLynch(ctx, { industry: meta?.industry ?? null, thresholds });
    const ratios = computeAllRatios(ctx, pegCategoryFor(lynch.category));

    // Invariants run before the signal is built, so a broken number never
    // reaches a buy decision without being reported first.
    const violations = checkInvariants(ctx, ratios);
    if (violations.length > 0) {
      log(`INVARIANT VIOLATION for ${symbol}:\n${formatViolations(violations)}`);
      allViolations.push(...violations);
    }

    const signal = evaluateSignal(ctx, ratios, lynch.category);

    const explanation = explainSignal({
      symbol,
      name: meta?.name ?? bundle.quote?.name ?? null,
      signal,
      ratios,
    });

    const previous = previousStatus.get(symbol) ?? null;
    const becameBuyWorthy = signal.status === 'buy_worthy' && previous !== 'buy_worthy';

    for (const result of Object.values(ratios) as RatioResult[]) {
      const detail = result.detail as { isAdjusted?: boolean; rawValue?: number | null };
      ratioRows.push({
        symbol,
        as_of: asOf,
        ratio_key: result.key,
        value: result.value,
        unit: result.unit,
        color: result.color,
        target_label: result.targetLabel,
        target_source: result.targetSource,
        thresholds: result.thresholds,
        currency: result.currency,
        history: result.history,
        not_applicable: result.notApplicable,
        unavailable_reason: result.unavailableReason,
        detail: result.detail,
        is_adjusted: detail.isAdjusted ?? false,
        raw_value: detail.rawValue ?? null,
      });
    }

    signalRows.push({
      symbol,
      as_of: asOf,
      status: signal.status,
      lynch_category: lynch.category,
      focus_sector: resolved.focusSector,
      conditions_met: signal.conditionsMet,
      conditions_total: 9,
      conditions_applicable: signal.conditionsApplicable,
      checklist: signal.conditions,
      why_en: explanation.en,
      why_nl: explanation.nl,
      ratio_snapshot: signal.ratioSnapshot,
      thresholds_used: thresholds,
      peg_basis: signal.pegBasis,
      became_buy_worthy: becameBuyWorthy,
      previous_status: previous,
    });

    rows.push({
      symbol,
      status: signal.status,
      previousStatus: previous,
      becameBuyWorthy,
      conditionsMet: signal.conditionsMet,
      conditionsApplicable: signal.conditionsApplicable,
      pegBasis: signal.pegBasis,
      focusSector: resolved.focusSector,
      lynchCategory: lynch.category,
      whyEn: explanation.en,
      whyNl: explanation.nl,
      isStale: bundle.isStale,
      errors: bundle.errors,
      violations,
    });
  }

  if (allViolations.length > 0) {
    log(
      `\n${allViolations.length} invariant violation(s) across ` +
        `${new Set(allViolations.map((v) => v.symbol)).size} ticker(s) — see above`,
    );
  }

  // --- persist --------------------------------------------------------------
  if (ratioRows.length > 0) {
    const { error } = await client
      .from('ratios')
      .upsert(ratioRows, { onConflict: 'symbol,as_of,ratio_key' });
    if (error) throw new Error(`ratios upsert failed: ${error.message}`);
    log(`wrote ${ratioRows.length} ratio rows`);
  }

  if (signalRows.length > 0) {
    const { error } = await client
      .from('signal_history')
      .upsert(signalRows, { onConflict: 'symbol,as_of' });
    if (error) throw new Error(`signal_history upsert failed: ${error.message}`);
    log(`wrote ${signalRows.length} signal rows`);
  }

  return rows;
}

/** The seed list from section 3.2. */
export const SEED_SYMBOLS = [
  'NVDA', 'ASML', 'AAPL', 'MSFT', 'META', 'GOOGL', 'NFLX', 'AMZN', 'ADBE', 'AMD',
  'AVGO', 'AMAT', 'V', 'MA', 'PYPL', 'AXP', 'ADYEN.AS', 'TSLA', 'BKNG', 'NKE',
  'SBUX', 'RMS.PA', 'MC.PA', 'KER.PA', 'CFR.SW', 'EL.PA', 'DIS',
];
