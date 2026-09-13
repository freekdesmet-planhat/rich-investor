/**
 * Peter Lynch classification (section 6).
 *
 * Only categories 1 and 2 can receive a buy signal; category 3 only with an
 * explicit warning. Everything else is labelled outside the book's focus.
 */
import { annualSeries, cagr, lastNYears, type SeriesPoint } from '@/lib/ratios/fundamentals';
import { DEFAULT_THRESHOLDS, type Thresholds } from '@/lib/ratios/thresholds';
import type { RatioContext } from '@/lib/ratios/engine';

export type LynchCategory =
  | 'high_growth'
  | 'average_growth'
  | 'low_growth'
  | 'cyclical'
  | 'turnaround'
  | 'financial_institution'
  | 'unknown';

export interface LynchResult {
  category: LynchCategory;
  /** 5-year EPS CAGR the growth bands were read from. */
  epsCagr: number | null;
  cagrYears: number;
  /** Standard deviation of year-on-year EPS growth, for the cyclical test. */
  epsVolatility: number | null;
  /** True for categories the book places outside its focus. */
  outsideFocus: boolean;
  /** Translation key for the label shown at the top of the detail page. */
  labelKey: string;
  reasons: string[];
}

/** Industries whose earnings swing with the economic cycle (section 6.4). */
const CYCLICAL_INDUSTRIES = [
  /auto/i,
  /construction/i,
  /building/i,
  /metals?\s*&?\s*mining/i,
  /chemical/i,
  /machinery/i,
  /airlines?/i,
  /oil|gas|energy/i,
  /paper|forest/i,
  /steel/i,
  /semiconductor/i,
];

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function yearOverYearGrowth(series: SeriesPoint[]): number[] {
  const growth: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    if (prev > 0) growth.push(series[i].value / prev - 1);
  }
  return growth;
}

export function classifyLynch(
  ctx: RatioContext,
  options: { industry?: string | null; thresholds?: Thresholds } = {},
): LynchResult {
  const { industry = ctx.bundle.quote?.industry ?? null, thresholds = DEFAULT_THRESHOLDS } = options;
  const t = thresholds.lynch.value;
  const reasons: string[] = [];

  const epsSeries = lastNYears(
    annualSeries(ctx.bundle.statements.income.annual, 'dilutedEps'),
    5,
  );
  const growth = cagr(epsSeries);
  const volatility = stdDev(yearOverYearGrowth(epsSeries));

  const base = (
    category: LynchCategory,
    labelKey: string,
    outsideFocus: boolean,
  ): LynchResult => ({
    category,
    epsCagr: growth.value,
    cagrYears: growth.years,
    epsVolatility: volatility,
    outsideFocus,
    labelKey,
    reasons,
  });

  // Banks and insurers first: their ratios mean something different entirely.
  if (ctx.isFinancial) {
    reasons.push('classified as a bank or insurer, which the book excludes from its focus');
    return base('financial_institution', 'lynch.financial_institution', true);
  }

  // Turnaround: losses or a sustained decline in profit.
  const netIncomeSeries = lastNYears(
    annualSeries(ctx.bundle.statements.income.annual, 'netIncome'),
    5,
  );
  const lossYears = netIncomeSeries.filter((p) => p.value <= 0).length;
  const declining =
    netIncomeSeries.length >= 3 &&
    netIncomeSeries.every((p, i) => i === 0 || p.value <= netIncomeSeries[i - 1].value);

  if (lossYears >= 2 || declining) {
    reasons.push(
      lossYears >= 2
        ? `${lossYears} of the last ${netIncomeSeries.length} years were loss-making`
        : 'profit has declined in every one of the last years',
    );
    return base('turnaround', 'lynch.turnaround', true);
  }

  // Cyclical: earnings swing hard, in an industry known for it. Both are
  // required — a volatile software company is not a cyclical, and a stable
  // year in a cyclical industry does not make it a steady grower.
  const industryIsCyclical = industry
    ? CYCLICAL_INDUSTRIES.some((pattern) => pattern.test(industry))
    : false;

  if (industryIsCyclical && volatility != null && volatility > t.cyclicalStdDev) {
    reasons.push(
      `earnings swing with the cycle (EPS growth standard deviation ` +
        `${(volatility * 100).toFixed(0)}%, above the ${(t.cyclicalStdDev * 100).toFixed(0)}% ` +
        `threshold) in a cyclical industry`,
    );
    return base('cyclical', 'lynch.cyclical', true);
  }

  if (growth.value == null) {
    reasons.push('not enough consistent earnings history to measure growth');
    return base('unknown', 'lynch.unknown', true);
  }

  if (growth.value >= t.highGrowth) {
    reasons.push(`EPS has compounded at ${(growth.value * 100).toFixed(1)}%/yr over 5 years`);
    return base('high_growth', 'lynch.high_growth', false);
  }
  if (growth.value >= t.averageGrowth) {
    reasons.push(`EPS has compounded at ${(growth.value * 100).toFixed(1)}%/yr over 5 years`);
    return base('average_growth', 'lynch.average_growth', false);
  }

  reasons.push(
    `EPS growth of ${(growth.value * 100).toFixed(1)}%/yr is below the book's 10% bar`,
  );
  return base('low_growth', 'lynch.low_growth', false);
}

/** The PEG threshold band a category maps onto (section 5.2). */
export function pegCategoryFor(
  category: LynchCategory,
): 'high_growth' | 'average_growth' | 'low_growth' {
  if (category === 'high_growth') return 'high_growth';
  if (category === 'average_growth') return 'average_growth';
  return 'low_growth';
}
