/**
 * The data-sanity layer (A4).
 *
 * A numbers product loses trust one visible absurdity at a time: an ROE of 443%
 * that "passes", a −79% revenue drop that is really a gross/net source mix, a
 * cash-conversion ratio of −305% described as clean. Each is a computed number
 * that is arithmetically correct and financially meaningless — the denominator
 * was tiny, the two years came from different feeds, the sign flipped on a one-off.
 *
 * So before a ratio reaches the checklist or the page, the obvious outliers are
 * demoted to grey "can't judge reliably", which is exactly what the Methodology
 * already promises for missing data: "A condition with missing data is shown grey
 * rather than failed." The raw figure is kept in `detail.rawValue` so the page can
 * still show what was seen, with the caveat, rather than asserting it.
 *
 * This is a floor, not a judgement: it only catches values outside any plausible
 * range for a real large company. A genuinely high-but-real ROE of 60% passes
 * through untouched; 443% does not.
 */
import type { RatioResult, RatioKey } from './engine';

interface SanityRule {
  /** True when the value is outside any plausible range and cannot be judged. */
  outlier: (value: number) => boolean;
  /** A short machine reason, surfaced in detail for the explanation/UI. */
  reason: string;
}

// Single-value outliers only. ROE is NOT size-tested — a real ROE can top 100%
// when buybacks shrink equity (Apple, Mastercard), and the ROA>10% half of the
// condition already stops that from carrying a weak business. ROE is instead
// tested on whether its denominator is even readable (equityTooThin, applied in
// the engine where the balance sheet is at hand). Growth likewise is tested for
// internal inconsistency, not size (revenueInconsistent).
const RULES: Partial<Record<RatioKey, SanityRule>> = {
  // A negative cash-conversion ratio (OCF below zero against positive net income)
  // is a sign flip on a one-off far more often than a readable signal at this size.
  earnings_quality: { outlier: (v) => v < 0, reason: 'cash_conversion_negative' },
};

/** Equity floor below which ROE is denominator noise rather than a real figure. */
const EQUITY_FLOOR_OF_ASSETS = 0.05; // 5% of total assets

/**
 * Whether a year's shareholders' equity is too thin to read an ROE from.
 *
 * ROE = net income / equity, so a negative or sliver-thin equity base makes the
 * ratio meaningless however arithmetically large it comes out (GoDaddy's 443% off
 * near-zero equity, Starbucks' negative equity). The test is the denominator, not
 * the result: a real 149% ROE on healthy equity (Apple) is left to stand, and the
 * ROA half of the condition guards against a buyback-inflated ROE flattering a weak
 * business.
 */
export function equityTooThin(equity: number | null, assets: number | null): boolean {
  if (equity == null || !Number.isFinite(equity)) return false;
  if (equity < 0) return true;
  if (assets != null && Number.isFinite(assets) && assets > 0) {
    return equity < EQUITY_FLOOR_OF_ASSETS * assets;
  }
  return false;
}

/** The revenue move worth scrutinising; below this, a divergence is just noise. */
const REVENUE_MOVE_FLOOR = 0.6; // ±60%

/** Gross profit must move at least this fraction of revenue, in the same direction. */
const GROSS_PROFIT_TRACKING = 0.4;

/**
 * Whether a year's revenue move is internally inconsistent with gross profit — the
 * signature of a gross/net or restatement source mix rather than a real change.
 *
 * Adyen's 2023 revenue fell 79% while gross profit rose 22% (it reclassified to net
 * revenue): opposite directions, clearly not a real collapse. Nvidia's revenue and
 * gross profit both roughly doubled together: real, and left alone. So the test is
 * direction and co-movement, never size — a company that genuinely doubled is not
 * punished for it.
 */
export function revenueInconsistent(revYoY: number | null, gpYoY: number | null): boolean {
  if (revYoY == null || gpYoY == null || !Number.isFinite(revYoY) || !Number.isFinite(gpYoY)) {
    return false;
  }
  if (Math.abs(revYoY) <= REVENUE_MOVE_FLOOR) return false;
  const oppositeDirection = Math.sign(revYoY) !== Math.sign(gpYoY);
  const grossProfitLags = Math.abs(gpYoY) < GROSS_PROFIT_TRACKING * Math.abs(revYoY);
  return oppositeDirection || grossProfitLags;
}

/** Demote one ratio to a grey "unreliable" result, keeping the raw figure. */
export function demote(result: RatioResult, reason: string): RatioResult {
  return {
    ...result,
    value: null,
    color: 'gray',
    notApplicable: false,
    unavailableReason: 'unreliable',
    detail: { ...(result.detail as Record<string, unknown>), rawValue: result.value, unreliableReason: reason },
  };
}

/**
 * Returns a copy of the ratio set with out-of-range values demoted to grey.
 * Ratios not covered by a rule, already grey, or within range pass through
 * unchanged.
 */
export function applySanity(
  ratios: Record<string, RatioResult>,
): Record<string, RatioResult> {
  const out: Record<string, RatioResult> = { ...ratios };
  for (const [key, rule] of Object.entries(RULES) as Array<[RatioKey, SanityRule]>) {
    const r = out[key];
    if (!r || r.value == null || r.color === 'gray') continue;
    if (rule.outlier(r.value)) out[key] = demote(r, rule.reason);
  }
  return out;
}
