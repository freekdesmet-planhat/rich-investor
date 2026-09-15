import { CONDITION_UNIT } from '@/lib/signal/conditionFormat';

/**
 * Which parts of a verdict rested on figures the app did not have.
 *
 * The page presents nine conditions as nine equal answers. They are not always:
 * a ratio the providers could not supply leaves its condition judged without
 * the number it is about, and the checklist still shows a cross — identical to
 * a cross that means "measured, and it failed". The footer named the providers
 * for the whole page and nothing said which figure came from where, or which
 * figure never arrived.
 *
 * Nothing here needs new data. A condition that was applicable, is about a
 * number, and has none is one the engine could not measure; the ROA adjustment
 * already flags itself as an approximation. This is the reading of what is
 * already stored.
 *
 * Pure, so "what counts as incomplete" can be tested without a database.
 */

export interface QualityCondition {
  key: string;
  applicable: boolean;
  passed: boolean;
  value: number | null;
  detail?: Record<string, unknown>;
}

export interface QualityInput {
  checklist: QualityCondition[];
  isStale?: boolean;
}

export interface DataQuality {
  /**
   * Conditions that were judged without the figure they are about.
   *
   * Only applicable ones: a condition that does not apply to this company —
   * free cash flow for a bank — is not a gap in the data, it is a rule that
   * does not apply, and the checklist already says so in its own words.
   */
  unmeasured: string[];
  /** Conditions resting on a figure the engine had to approximate. */
  approximated: string[];
  isStale: boolean;
  /** True when there is anything at all worth telling the reader. */
  hasIssues: boolean;
}

export function dataQualityOf(input: QualityInput): DataQuality {
  const applicable = input.checklist.filter((c) => c.applicable);

  // A condition with no unit carries no number by design — focus sector and
  // growth category are verdicts about a category, and `value: null` on those
  // is the normal case rather than a missing figure. Flagging them put a
  // warning on every ticker on the list, which is how a warning stops being
  // read at all.
  const unmeasured = applicable
    .filter((c) => CONDITION_UNIT[c.key] !== 'none' && c.value == null)
    .map((c) => c.key);

  // The ROA adjustment for payment processors is explicitly an approximation —
  // it says so in its own detail — and it decides a condition.
  const approximated = applicable
    .filter((c) => {
      const detail = c.detail ?? {};
      return detail.roaIsAdjusted === true || detail.isApproximation === true;
    })
    .map((c) => c.key);

  // `fetch_errors` is deliberately not used. It records every attempt the
  // fetch made, including recoverable ones: every ticker in the database
  // carries "sec-edgar coverage check: SEC ticker file: HTTP 403" while its
  // figures arrived perfectly well from elsewhere. It cannot support the claim
  // that a figure is missing, and `unmeasured` can.
  const isStale = input.isStale === true;

  return {
    unmeasured,
    approximated,
    isStale,
    hasIssues: unmeasured.length > 0 || approximated.length > 0 || isStale,
  };
}

/**
 * Which stored sources a metric's figures came from.
 *
 * The snapshot records one source per statement, so a ratio's provenance is the
 * provenance of the statements it divides. The map says which those are; a
 * ratio missing from it falls back to naming every statement source, which is
 * vague but never wrong.
 */
export const RATIO_STATEMENTS: Record<string, Array<'income' | 'balance' | 'cashFlow'>> = {
  pe: ['income'],
  peg: ['income'],
  ev_ebit: ['income', 'balance'],
  p_fcf: ['cashFlow'],
  earnings_quality: ['income', 'cashFlow'],
  roe: ['income', 'balance'],
  roa: ['income', 'balance'],
  eps_growth: ['income'],
  revenue_growth: ['income'],
  gross_margin: ['income'],
  net_margin: ['income'],
  debt: ['balance', 'income'],
  current_ratio: ['balance'],
  p_b: ['balance'],
  rnd_adjusted_pe: ['income'],
  dividend_yield: ['cashFlow'],
  payout_ratio: ['income', 'cashFlow'],
};

/** The distinct source names behind a ratio, in a stable order. */
export function sourcesForRatio(
  ratioKey: string,
  statementSources: Record<string, string | null> | null | undefined,
): string[] {
  const sources = statementSources ?? {};
  const wanted = RATIO_STATEMENTS[ratioKey] ?? (Object.keys(sources) as Array<keyof typeof sources>);

  const named = (wanted as string[])
    .map((statement) => sources[statement])
    .filter((source): source is string => typeof source === 'string' && source !== '');

  return [...new Set(named)].sort();
}
