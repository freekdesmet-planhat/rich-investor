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

/** Above this, a return ratio is denominator noise, not a real figure (ROE 443%). */
const RETURN_OUTLIER = 1.0; // 100%

/** Beyond ±this, a year-on-year change is almost always a source/restatement mix. */
const GROWTH_OUTLIER = 0.6; // ±60%

interface SanityRule {
  /** True when the value is outside any plausible range and cannot be judged. */
  outlier: (value: number) => boolean;
  /** A short machine reason, surfaced in detail for the explanation/UI. */
  reason: string;
}

const RULES: Partial<Record<RatioKey, SanityRule>> = {
  roe: { outlier: (v) => Math.abs(v) > RETURN_OUTLIER, reason: 'roe_out_of_range' },
  roa: { outlier: (v) => Math.abs(v) > RETURN_OUTLIER, reason: 'roa_out_of_range' },
  revenue_growth: { outlier: (v) => Math.abs(v) > GROWTH_OUTLIER, reason: 'growth_out_of_range' },
  eps_growth: { outlier: (v) => Math.abs(v) > GROWTH_OUTLIER, reason: 'growth_out_of_range' },
  // A negative cash-conversion ratio (OCF below zero against positive net income)
  // is a sign flip on a one-off far more often than a readable signal at this size.
  earnings_quality: { outlier: (v) => v < 0, reason: 'cash_conversion_negative' },
};

/** Demote one ratio to a grey "unreliable" result, keeping the raw figure. */
function demote(result: RatioResult, reason: string): RatioResult {
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
