/**
 * The buy-worthy signal (section 7, "the success pattern").
 *
 * Nine hard conditions, but the denominator is never assumed to be nine: each
 * condition declares whether it applies to this company, and the status rule
 * counts only applicable ones. Banks and insurers have no meaningful free cash
 * flow or debt ratio, so scoring them out of a fixed nine would mark them down
 * for checks that cannot apply to them. The same machinery covers payment
 * processors, whose inventory/receivables card is n/a.
 */
import type { RatioKey, RatioResult, RatioContext } from '@/lib/ratios/engine';
import type { LynchCategory } from './lynch';

export type SignalStatus = 'buy_worthy' | 'almost' | 'watching';

/** Which PEG variant satisfied condition 5. */
export type PegBasis = 'trailing' | 'forward' | 'both' | 'none';

export interface ConditionResult {
  key: string;
  /** False when the condition cannot apply to this company at all. */
  applicable: boolean;
  passed: boolean;
  /** The figure the condition was decided on. */
  value: number | null;
  target: string;
  /** Why it does not apply, when applicable is false. */
  notApplicableReason?: string;
  detail: Record<string, unknown>;
}

export interface SignalResult {
  status: SignalStatus;
  lynchCategory: LynchCategory;
  conditions: ConditionResult[];
  /** Applicable conditions that passed. */
  conditionsMet: number;
  /** Conditions that apply to this company — never assumed to be 9. */
  conditionsApplicable: number;
  pegBasis: PegBasis;
  /** True when only the forward PEG carried condition 5. */
  reliesOnForwardPeg: boolean;
  ratioSnapshot: Record<string, number | null>;
  missing: string[];
}

const ALWAYS = { applicable: true } as const;

/**
 * Condition 5: PEG at or below the category threshold, on either basis.
 *
 * Trailing-only would systematically reject the pattern the book is built
 * around — a quality company in a temporary growth dip, which is exactly when
 * chapter 9 says to act. Forward-only would lean entirely on analyst consensus,
 * which chapter 1 is sceptical of. Either may carry the condition, and the
 * explanation states which one did.
 */
function pegCondition(peg: RatioResult): { condition: ConditionResult; basis: PegBasis } {
  const detail = peg.detail as {
    forwardPeg?: number | null;
    forwardGrowth?: number | null;
    epsCagr?: number | null;
    estimatesSource?: string | null;
  };
  const thresholds = peg.thresholds as { threshold?: number };
  const threshold = thresholds.threshold ?? 1;

  const trailing = peg.value;
  const forward = detail.forwardPeg ?? null;

  const trailingPasses = trailing != null && trailing > 0 && trailing <= threshold;
  const forwardPasses = forward != null && forward > 0 && forward <= threshold;

  const basis: PegBasis =
    trailingPasses && forwardPasses
      ? 'both'
      : trailingPasses
        ? 'trailing'
        : forwardPasses
          ? 'forward'
          : 'none';

  return {
    basis,
    condition: {
      key: 'peg',
      ...ALWAYS,
      passed: trailingPasses || forwardPasses,
      value: trailingPasses ? trailing : forwardPasses ? forward : trailing,
      target: `≤ ${threshold}`,
      detail: {
        trailingPeg: trailing,
        forwardPeg: forward,
        threshold,
        basis,
        trailingPasses,
        forwardPasses,
        epsCagr: detail.epsCagr ?? null,
        forwardGrowth: detail.forwardGrowth ?? null,
        estimatesSource: detail.estimatesSource ?? null,
        // Flags the opposite direction: trailing looks fine but the outlook
        // has deteriorated.
        outlookDeteriorating: trailingPasses && forward != null && forward > threshold,
      },
    },
  };
}

export function evaluateSignal(
  ctx: RatioContext,
  ratios: Record<RatioKey, RatioResult>,
  lynchCategory: LynchCategory,
  options: { previousStatus?: SignalStatus | null } = {},
): SignalResult {
  const conditions: ConditionResult[] = [];

  // 1. Inside one of the four focus sectors.
  conditions.push({
    key: 'focus_sector',
    ...ALWAYS,
    passed: ctx.focusSector !== 'outside_focus',
    value: null,
    target: 'one of the four focus sectors',
    detail: { focusSector: ctx.focusSector },
  });

  // 2. Lynch category 1 or 2.
  conditions.push({
    key: 'lynch_category',
    ...ALWAYS,
    passed: lynchCategory === 'high_growth' || lynchCategory === 'average_growth',
    value: null,
    target: 'high or average earnings growth',
    detail: { lynchCategory },
  });

  // 3. Market cap at or above $10bn.
  const marketCap = ratios.market_cap;
  conditions.push({
    key: 'market_cap',
    ...ALWAYS,
    passed: marketCap.color === 'green',
    value: marketCap.value,
    target: '≥ $10B',
    detail: marketCap.detail,
  });

  // 4. Drawdown from the 5-year high.
  const drawdown = ratios.drawdown_5y;
  const drawdownThresholds = drawdown.thresholds as { green?: number };
  conditions.push({
    key: 'drawdown',
    ...ALWAYS,
    passed: drawdown.value != null && -drawdown.value >= (drawdownThresholds.green ?? 0.5),
    value: drawdown.value,
    target: `≥ ${((drawdownThresholds.green ?? 0.5) * 100).toFixed(0)}% below the 5-year high`,
    detail: { ...drawdown.detail, green: drawdownThresholds.green ?? 0.5 },
  });

  // 5. PEG, trailing or forward.
  const peg = pegCondition(ratios.peg);
  conditions.push(peg.condition);

  // 6. P/E at or below 30, or R&D-adjusted P/E at or below 20 for tech.
  const pe = ratios.pe;
  const rndPe = ratios.rnd_adjusted_pe;
  const peThresholds = pe.thresholds as { green?: number };
  const rndThresholds = rndPe.thresholds as { green?: number };
  const pePasses = pe.value != null && pe.value <= (peThresholds.green ?? 30);
  const rndPasses =
    !rndPe.notApplicable && rndPe.value != null && rndPe.value <= (rndThresholds.green ?? 20);

  conditions.push({
    key: 'pe',
    ...ALWAYS,
    passed: pePasses || rndPasses,
    value: pe.value,
    target: '≤ 30, or R&D-adjusted ≤ 20',
    detail: {
      pe: pe.value,
      rndAdjustedPe: rndPe.value,
      pePasses,
      rndPasses,
      rndApplicable: !rndPe.notApplicable,
    },
  });

  // 7. ROE above 15% and ROA above 10%, consistently.
  const roe = ratios.roe;
  const roa = ratios.roa;
  const roaDetail = roa.detail as { isAdjusted?: boolean; rawValue?: number | null };
  conditions.push({
    key: 'returns',
    ...ALWAYS,
    passed: roe.color === 'green' && roa.color === 'green',
    value: roe.value,
    target: 'ROE > 15% and ROA > 10%',
    detail: {
      roe: roe.value,
      roa: roa.value,
      roeColor: roe.color,
      roaColor: roa.color,
      roaIsAdjusted: roaDetail.isAdjusted ?? false,
      roaRawValue: roaDetail.rawValue ?? null,
    },
  });

  // 8. Free cash flow positive, operating cash flow at least 70% of net income.
  //    Free cash flow is not a meaningful figure for a bank or insurer.
  const pFcf = ratios.p_fcf;
  const quality = ratios.earnings_quality;
  const fcfPositive = pFcf.unavailableReason !== 'negative_base' && pFcf.value != null;
  const qualityOk = quality.value != null && quality.value >= 0.7;

  conditions.push({
    key: 'cash_flow',
    applicable: !ctx.isFinancial,
    passed: !ctx.isFinancial && fcfPositive && qualityOk,
    value: quality.value,
    target: 'free cash flow positive, operating cash flow ≥ 70% of net income',
    notApplicableReason: ctx.isFinancial ? 'financial_institution' : undefined,
    detail: { fcfPositive, qualityOk, ocfOverNetIncome: quality.value },
  });

  // 9. Debt not red. Leverage means something different for a bank.
  const debt = ratios.debt;
  conditions.push({
    key: 'debt',
    applicable: !ctx.isFinancial,
    passed: !ctx.isFinancial && debt.color !== 'red' && debt.color !== 'gray',
    value: debt.value,
    target: 'net debt/EBITDA ≤ 2.5',
    notApplicableReason: ctx.isFinancial ? 'financial_institution' : undefined,
    detail: debt.detail,
  });

  // --- status -------------------------------------------------------------
  const applicable = conditions.filter((c) => c.applicable);
  const conditionsApplicable = applicable.length;
  const conditionsMet = applicable.filter((c) => c.passed).length;

  // Conditions 1-3 are the gate; the rest are the quality bar.
  const gateKeys = new Set(['focus_sector', 'lynch_category', 'market_cap']);
  const gate = applicable.filter((c) => gateKeys.has(c.key));
  const rest = applicable.filter((c) => !gateKeys.has(c.key));

  const gatePassed = gate.every((c) => c.passed);
  const restPassed = rest.filter((c) => c.passed).length;

  let status: SignalStatus;
  if (conditionsMet === conditionsApplicable) {
    status = 'buy_worthy';
  } else if (gatePassed && rest.length > 0 && restPassed >= rest.length - 1) {
    // "Almost there": the gate holds and at most one quality check is missing.
    status = 'almost';
  } else {
    status = 'watching';
  }

  const missing = applicable.filter((c) => !c.passed).map((c) => c.key);

  const ratioSnapshot: Record<string, number | null> = {};
  for (const [key, result] of Object.entries(ratios)) ratioSnapshot[key] = result.value;

  return {
    status,
    lynchCategory,
    conditions,
    conditionsMet,
    conditionsApplicable,
    pegBasis: peg.basis,
    reliesOnForwardPeg: peg.basis === 'forward',
    ratioSnapshot,
    missing,
  };
}
