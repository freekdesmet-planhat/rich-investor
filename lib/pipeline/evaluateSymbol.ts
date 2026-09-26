/**
 * One symbol, evaluated once — the single path both pipelines run.
 *
 * The nightly watchlist pass (runDaily.ts) and the universe scan (scan.ts) each
 * used to inline the same sequence — resolve the focus sector, build the ratio
 * context, classify the Lynch category, compute the ratios, evaluate the signal,
 * write the explanation — and each built the `ratios` and `signal_history` rows
 * from it by hand, in copies that had already drifted: the scan judged against
 * the app defaults while the watchlist honoured the household's threshold
 * overrides, so a customised threshold changed what you watched but not what was
 * suggested. Two builders, one behaviour, is the exact split that produced the
 * 09-21 suggestions bug; this is the same lesson applied to the evaluation
 * itself.
 *
 * So there is one function now. It takes the thresholds as a parameter — both
 * callers pass the household's merged overrides — and returns the evaluation and
 * the two DB row shapes, built once. The callers decide what to do with them:
 * the watchlist persists every symbol and emails on the crossings; the scan
 * persists only the names it raises. Nothing here reads or writes the database.
 */
import { buildContext, computeAllRatios, type RatioResult } from '@/lib/ratios/engine';
import { applySanity } from '@/lib/ratios/sanity';
import { checkInvariants, type InvariantViolation } from '@/lib/ratios/invariants';
import { evaluateSignal, type SignalResult, type SignalStatus } from '@/lib/signal/buyWorthy';
import { explainSignal, explainSections } from '@/lib/signal/explain';
import { classifyLynch, pegCategoryFor } from '@/lib/signal/lynch';
import { resolveFocusSector, type FocusSector, type SectorRule } from '@/lib/sectors/mapping';
import type { Thresholds } from '@/lib/ratios/thresholds';
import type { SymbolBundle } from '@/lib/providers/marketData';
import type { FxRates } from '@/lib/providers/fx';

/** The buy-worthy checklist is nine conditions (section 5). */
const CONDITIONS_TOTAL = 9;

/** Banks and insurers, whose ratios mean something different (section 6.6). */
function isFinancialInstitution(sector: string | null, industry: string | null): boolean {
  if (sector !== 'Financials') return false;
  return /bank|insurance|thrift/i.test(industry ?? '');
}

export interface EvaluateSymbolInput {
  symbol: string;
  /** For the explanation and the suggestion/pipeline rows the caller builds. */
  name: string | null;
  sector: string | null;
  industry: string | null;
  bundle: SymbolBundle;
  rules: SectorRule[];
  /** The household's merged overrides, or DEFAULT_THRESHOLDS. Both callers pass this. */
  thresholds: Thresholds;
  fx: FxRates;
  asOf: string;
  /**
   * The last stored status, to detect the crossing into buy-worthy. The scan
   * has no watchlist history to compare against and leaves it null, which is
   * also the default.
   */
  previousStatus?: SignalStatus | null;
}

export interface EvaluatedSymbol {
  symbol: string;
  name: string | null;
  focusSector: FocusSector;
  lynchCategory: string;
  signal: SignalResult;
  ratios: Record<string, RatioResult>;
  explanation: { en: string; nl: string };
  violations: InvariantViolation[];
  previousStatus: SignalStatus | null;
  becameBuyWorthy: boolean;
  /**
   * The company's market cap in USD, as the engine computed it. Written back to
   * the universe row so search can floor and label on a real figure instead of
   * the static dataset's stale band (A1c).
   */
  marketCapUsd: number | null;
  /**
   * The five-year high and the decline against it at this evaluation, from the
   * drawdown_5y ratio. Both are written back to the universe row (A12b) so the
   * nightly price pass — which fetches a price but no history — can recompute the
   * decline against today's price and detect a name crossing the entry line
   * between full evaluations.
   */
  priceHigh5y: number | null;
  drawdown5y: number | null;
  /** Ready to upsert into `ratios` (one per computed ratio). */
  ratioRows: Record<string, unknown>[];
  /** Ready to upsert into `signal_history`. */
  signalRow: Record<string, unknown>;
}

/** The `ratios` rows for one symbol — pure function of the computed ratios. */
function buildRatioRows(
  symbol: string,
  asOf: string,
  ratios: Record<string, RatioResult>,
): Record<string, unknown>[] {
  return (Object.values(ratios) as RatioResult[]).map((result) => {
    const detail = result.detail as { isAdjusted?: boolean; rawValue?: number | null };
    return {
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
    };
  });
}

/** The `signal_history` row for one symbol. */
function buildSignalRow(args: {
  symbol: string;
  asOf: string;
  signal: SignalResult;
  lynchCategory: string;
  focusSector: FocusSector;
  explanation: { en: string; nl: string };
  whyParts: ReturnType<typeof explainSections>;
  thresholds: Thresholds;
  becameBuyWorthy: boolean;
  previousStatus: SignalStatus | null;
}): Record<string, unknown> {
  return {
    symbol: args.symbol,
    as_of: args.asOf,
    status: args.signal.status,
    lynch_category: args.lynchCategory,
    focus_sector: args.focusSector,
    conditions_met: args.signal.conditionsMet,
    conditions_total: CONDITIONS_TOTAL,
    conditions_applicable: args.signal.conditionsApplicable,
    checklist: args.signal.conditions,
    why_en: args.explanation.en,
    why_nl: args.explanation.nl,
    // The same sentences, still grouped: the prose is the source for the email,
    // this is what lets the page lead with a verdict.
    why_parts: args.whyParts,
    ratio_snapshot: args.signal.ratioSnapshot,
    thresholds_used: args.thresholds,
    peg_basis: args.signal.pegBasis,
    became_buy_worthy: args.becameBuyWorthy,
    previous_status: args.previousStatus,
  };
}

/**
 * Evaluate one symbol and build its DB rows. Assumes `bundle` is present; the
 * callers do their own "no data" / "no price" skip before calling.
 */
export function evaluateSymbol(input: EvaluateSymbolInput): EvaluatedSymbol {
  const { symbol, name, sector, industry, bundle, rules, thresholds, fx, asOf } = input;
  const previousStatus = input.previousStatus ?? null;

  const resolved = resolveFocusSector(rules, { symbol, sector, industry });

  const ctx = buildContext(bundle, {
    focusSector: resolved.focusSector,
    isFinancial: isFinancialInstitution(sector, industry),
    isPaymentProcessor: resolved.isPaymentProcessor,
    thresholds,
    fx,
  });

  const lynch = classifyLynch(ctx, { industry, thresholds });
  // Demote out-of-range values (ROE 443%, a −79% source-mix revenue drop, a
  // negative cash conversion) to grey "can't judge reliably" before the signal
  // and the stored rows are built, so nothing downstream asserts a meaningless
  // number (A4).
  const ratios = applySanity(computeAllRatios(ctx, pegCategoryFor(lynch.category)));

  // Invariants run before the signal is built, so a broken number never reaches
  // a buy decision without being reported first. The caller decides whether to
  // log them.
  const violations = checkInvariants(ctx, ratios);

  const signal = evaluateSignal(ctx, ratios, lynch.category);

  const explainInput = { symbol, name, signal, ratios, currency: bundle.quote?.currency ?? null };
  const explanation = explainSignal(explainInput);

  const becameBuyWorthy = signal.status === 'buy_worthy' && previousStatus !== 'buy_worthy';

  return {
    symbol,
    name,
    focusSector: resolved.focusSector,
    lynchCategory: lynch.category,
    signal,
    ratios,
    explanation,
    violations,
    previousStatus,
    becameBuyWorthy,
    marketCapUsd: (ratios.market_cap?.value as number | null | undefined) ?? null,
    priceHigh5y: ((ratios.drawdown_5y?.detail as { high?: number | null } | undefined)?.high) ?? null,
    drawdown5y: (ratios.drawdown_5y?.value as number | null | undefined) ?? null,
    ratioRows: buildRatioRows(symbol, asOf, ratios),
    signalRow: buildSignalRow({
      symbol,
      asOf,
      signal,
      lynchCategory: lynch.category,
      focusSector: resolved.focusSector,
      explanation,
      whyParts: explainSections(explainInput),
      thresholds,
      becameBuyWorthy,
      previousStatus,
    }),
  };
}
