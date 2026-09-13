/**
 * Every target the ratio engine judges against.
 *
 * Each one declares whether the number comes from the book or is an app
 * default the book does not state literally (section 5). The UI shows that
 * distinction on each card, and app defaults are editable in settings; these
 * values seed the `settings.thresholds` document.
 */

export type ThresholdSource = 'book' | 'app_default';

export interface Threshold<T> {
  value: T;
  source: ThresholdSource;
  /** Shown under the ratio card, in the active language via the translation keys. */
  label: string;
}

const book = <T>(value: T, label: string): Threshold<T> => ({ value, source: 'book', label });
const app = <T>(value: T, label: string): Threshold<T> => ({
  value,
  source: 'app_default',
  label,
});

export const DEFAULT_THRESHOLDS = {
  // 5.1 P/E — the book gives 30 as a ceiling even for fast growers.
  pe: book({ green: 30, orange: 40 }, '≤ 30'),

  // 5.2 PEG — three thresholds by growth category (section 6).
  peg: book(
    { high_growth: 1, average_growth: 0.7, low_growth: 0.5, orangeMultiplier: 1.2 },
    '≤ 1 / 0.7 / 0.5 by growth category',
  ),

  // 5.3 EV/EBIT — the book works an example ending at 10 but states no cutoff.
  evEbit: app({ green: 20, orange: 28 }, '≤ 20'),

  // 5.4 P/FCF
  pFcf: app({ green: 25, orange: 35 }, '≤ 25'),

  // 5.5 Operating cash flow / net income
  earningsQuality: book({ green: 1, orange: 0.7 }, '≥ 1'),

  // 5.6 ROE — above 15%, consistently, over multiple years.
  roe: book(
    { green: 0.15, orange: 0.1, yearsRequired: 4, yearsWindow: 5 },
    '> 15% in 4 of 5 years',
  ),

  // 5.7 ROA
  roa: book({ green: 0.1, orange: 0.06 }, '> 10%'),

  // 5.8 EPS growth
  epsGrowth: book({ green: 0.15, orange: 0.1 }, '≥ 15%/yr'),

  // 5.9 Revenue growth
  revenueGrowth: app({ green: 0.1, orange: 0.05 }, '≥ 10%/yr'),

  // 5.10 Margins
  grossMargin: book({ green: 0.5, orange: 0.3 }, '≥ 50% or rising 5 years'),
  netMargin: book({ green: 0.2, orange: 0.12 }, '≥ 20%'),

  // 5.11 Debt
  debt: app(
    { netDebtEbitdaGreen: 1, netDebtEbitdaOrange: 2.5, coverageGreen: 8, coverageOrange: 4 },
    'net debt/EBITDA ≤ 1',
  ),

  // 5.12 Dividend yield — informational; a very high yield is the warning.
  dividendYield: book({ warnOrange: 0.05, warnRed: 0.07 }, 'not a buy criterion; > 7% warns'),

  // 5.13 Payout ratio
  payoutRatio: book({ green: 0.4, orange: 0.75, red: 0.9 }, '≤ 40% for growth stocks'),

  // 5.14 R&D-adjusted P/E — tech and interactive media only.
  rndAdjustedPe: book({ green: 20, orange: 25 }, '≤ 20'),

  // 5.18 Drawdown from the 5-year high — the core signal.
  drawdown: book(
    { green: 0.5, orange: 0.35, minimumForSignal: 0.35, windowYears: 5 },
    '≥ 50% below the 5-year high',
  ),

  // 5.19 Market cap and sector-leader status.
  marketCap: book({ minimumUsd: 10_000_000_000 }, '≥ $10B'),

  // 6. Lynch categories, by 5-year EPS CAGR.
  lynch: book(
    { highGrowth: 0.2, averageGrowth: 0.1, cyclicalStdDev: 0.35 },
    '≥ 20% high, 10–20% average, < 10% low',
  ),
} as const;

export type Thresholds = typeof DEFAULT_THRESHOLDS;

/** Unwraps `{value, source, label}` into just the values, for the maths. */
export type ThresholdValues = {
  [K in keyof Thresholds]: Thresholds[K]['value'];
};

export function thresholdValues(thresholds: Thresholds = DEFAULT_THRESHOLDS): ThresholdValues {
  return Object.fromEntries(
    Object.entries(thresholds).map(([key, entry]) => [key, entry.value]),
  ) as ThresholdValues;
}

/**
 * Merges user overrides from `settings.thresholds` over the defaults.
 * Only the `value` is overridable; the source and label stay as shipped, so a
 * card still says whether the *original* target came from the book.
 */
export function mergeThresholds(
  overrides: Partial<Record<keyof Thresholds, unknown>> = {},
): Thresholds {
  const merged = { ...DEFAULT_THRESHOLDS } as Record<string, unknown>;

  for (const [key, override] of Object.entries(overrides)) {
    const base = DEFAULT_THRESHOLDS[key as keyof Thresholds];
    if (!base || override === null || typeof override !== 'object') continue;
    merged[key] = {
      ...base,
      value: { ...(base.value as object), ...(override as object) },
    };
  }

  return merged as Thresholds;
}
