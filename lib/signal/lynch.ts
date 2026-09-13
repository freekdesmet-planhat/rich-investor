/**
 * Peter Lynch classification (section 6).
 *
 * Only categories 1 and 2 can receive a buy signal; category 3 only with an
 * explicit warning. Everything else is labelled outside the book's focus.
 */
import {
  annualSeries,
  lastNYears,
  trendGrowth,
  type SeriesPoint,
} from '@/lib/ratios/fundamentals';
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
  /**
   * Which series the growth figure came from. 'revenue' means the EPS history
   * was too incomplete to measure and the classification is weaker — it is used
   * for the Lynch category only, never for PEG or the buy signal.
   */
  growthBasis: GrowthBasis;
  /** Translation key for the caveat shown next to the category, when any. */
  basisNoteKey: string | null;
  /**
   * True when the growth rate fell just short of the band and the tolerance
   * zone lifted it. Shown on the category chip so the borderline is visible.
   */
  resolvedUpByTolerance: boolean;
}

export type GrowthBasis = 'eps' | 'eps_partial' | 'revenue' | 'none';

/**
 * Picks the best growth measurement available, in the order the spec sets out.
 *
 * 1. the full EPS window
 * 2. the longest consecutive EPS run inside it, if at least 3 years
 * 3. revenue growth, for classification only
 * 4. nothing
 */
function measureGrowth(
  epsSeries: SeriesPoint[],
  revenueSeries: SeriesPoint[],
): {
  growth: { value: number | null; years: number };
  series: SeriesPoint[];
  basis: GrowthBasis;
  noteKey: string | null;
} {
  const full = trendGrowth(epsSeries);
  if (full.value != null) {
    return { growth: full, series: epsSeries, basis: 'eps', noteKey: null };
  }

  const run = longestConsecutiveRun(epsSeries);
  const partial = trendGrowth(run);
  if (partial.value != null && run.length >= 3) {
    return {
      growth: partial,
      series: run,
      basis: 'eps_partial',
      noteKey: 'lynch.basis_eps_partial',
    };
  }

  const revenue = trendGrowth(revenueSeries);
  if (revenue.value != null) {
    return {
      growth: revenue,
      series: revenueSeries,
      basis: 'revenue',
      noteKey: 'lynch.basis_revenue',
    };
  }

  return {
    growth: { value: null, years: 0 },
    series: epsSeries,
    basis: 'none',
    noteKey: null,
  };
}

/**
 * The longest run of consecutive fiscal years in a series.
 *
 * Periods roughly 12 months apart count as consecutive; a wider step means a
 * year is missing and the run restarts.
 */
function longestConsecutiveRun(series: SeriesPoint[]): SeriesPoint[] {
  if (series.length < 2) return series;

  let best: SeriesPoint[] = [];
  let current: SeriesPoint[] = [series[0]];

  for (let i = 1; i < series.length; i++) {
    const months =
      (Date.parse(series[i].period) - Date.parse(series[i - 1].period)) / (30.44 * 86_400_000);
    if (months >= 9 && months <= 15) {
      current.push(series[i]);
    } else {
      if (current.length > best.length) best = current;
      current = [series[i]];
    }
  }
  if (current.length > best.length) best = current;
  return best;
}

/**
 * Industries whose earnings swing with the economic cycle (section 6.4):
 * the book's own list is auto, construction, commodities and industrials.
 *
 * Semiconductors are deliberately absent. Their earnings are genuinely
 * volatile, but the book puts microchips and chip equipment at the opposite
 * end — the best-performing subsector it covers, naming Nvidia, AMD, Broadcom
 * and Applied Materials as the companies behind that. Volatility alone does not
 * separate a classic cyclical from a structurally volatile secular grower, and
 * classifying these as cyclical barred exactly the book's headline examples
 * from ever earning a buy signal.
 */
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
  /industrial conglomerates/i,
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
  const revenueSeries = lastNYears(
    annualSeries(ctx.bundle.statements.income.annual, 'revenue'),
    5,
  );

  // A CAGR needs only its two endpoints, so a gap in the middle of the window
  // should not block it — only a gap at an endpoint should. Fall back through
  // EPS -> longest consecutive EPS run -> revenue, and label which one fired.
  const measured = measureGrowth(epsSeries, revenueSeries);
  const growth = measured.growth;
  const volatility = stdDev(yearOverYearGrowth(measured.series));

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
    growthBasis: measured.basis,
    basisNoteKey: measured.noteKey,
    resolvedUpByTolerance: false,
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

  // Bands resolve upward inside the tolerance zone, so a company a few basis
  // points short of a threshold is not pushed into a materially stricter PEG
  // ceiling by a rounding difference.
  const tolerance = thresholds.lynchTolerance.value.band;
  const rate = (growth.value * 100).toFixed(1);

  if (growth.value >= t.highGrowth - tolerance) {
    const withinTolerance = growth.value < t.highGrowth;
    reasons.push(
      withinTolerance
        ? `EPS growth of ${rate}%/yr is within the tolerance band of the 20% high-growth threshold`
        : `EPS has compounded at ${rate}%/yr over 5 years`,
    );
    return { ...base('high_growth', 'lynch.high_growth', false), resolvedUpByTolerance: withinTolerance };
  }
  if (growth.value >= t.averageGrowth - tolerance) {
    const withinTolerance = growth.value < t.averageGrowth;
    reasons.push(
      withinTolerance
        ? `EPS growth of ${rate}%/yr is within the tolerance band of the 10% average-growth threshold`
        : `EPS has compounded at ${rate}%/yr over 5 years`,
    );
    return { ...base('average_growth', 'lynch.average_growth', false), resolvedUpByTolerance: withinTolerance };
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
