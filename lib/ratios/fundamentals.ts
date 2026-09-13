/**
 * Period helpers over normalised statements.
 *
 * The book insists that a single year says little and the multi-year trend says
 * everything (section 5), so everything here works on series rather than single
 * values, and every function reports *why* it has no answer instead of
 * silently returning 0.
 */
import type { FinancialStatement, MetricName, PricePoint } from '@/lib/providers/types';

/** How a trailing figure was obtained. */
export type Basis =
  /** Sum of the last four reported quarters. */
  | 'ttm'
  /** Last full fiscal year — used when no quarterly data exists (EU listings). */
  | 'annual'
  /** No data at all. */
  | 'none';

export interface TrailingValue {
  value: number | null;
  basis: Basis;
  /** Period end date the figure is anchored to. */
  asOf: string | null;
}

export interface SeriesPoint {
  period: string;
  value: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Annual series for one metric, oldest first, suitable for a sparkline. */
export function annualSeries(
  statement: FinancialStatement | null,
  metric: MetricName,
): SeriesPoint[] {
  if (!statement) return [];
  return statement.periods
    .filter((p) => isNum(p.metrics[metric]))
    .map((p) => ({ period: p.endDate, value: p.metrics[metric] as number }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Trims a series to the last `years` fiscal years.
 *
 * EDGAR returns the full filing history (19 years for ASML), but the book's
 * rules are written for a 5-year window, and a CAGR measured over 18 years
 * answers a different question than the one being asked. `years` counts
 * intervals, so 5 years keeps 6 points where they exist.
 */
export function lastNYears(series: SeriesPoint[], years: number): SeriesPoint[] {
  return series.slice(-(years + 1));
}

/** Newest annual value for one metric. */
export function latestAnnual(
  statement: FinancialStatement | null,
  metric: MetricName,
): TrailingValue {
  const series = annualSeries(statement, metric);
  const last = series.at(-1);
  return last
    ? { value: last.value, basis: 'annual', asOf: last.period }
    : { value: null, basis: 'none', asOf: null };
}

/**
 * Sums the last four quarters of a flow metric (revenue, net income, cash flow).
 * Returns basis 'none' when fewer than four quarters are available.
 */
export function sumTtm(statement: FinancialStatement | null, metric: MetricName): TrailingValue {
  if (!statement || statement.frequency !== 'quarterly') {
    return { value: null, basis: 'none', asOf: null };
  }
  const quarters = statement.periods
    .filter((p) => isNum(p.metrics[metric]))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, 4);

  if (quarters.length < 4) return { value: null, basis: 'none', asOf: null };

  return {
    value: quarters.reduce((sum, q) => sum + (q.metrics[metric] as number), 0),
    basis: 'ttm',
    asOf: quarters[0].endDate,
  };
}

/**
 * Trailing figure for a *flow* metric: TTM where available, else the last full
 * fiscal year. This is the fallback the spec asks for, inverted to match what
 * the provider can actually supply — European listings have no quarterly data,
 * so for those the annual figure is the only trailing figure that exists.
 */
export function trailingFlow(
  quarterly: FinancialStatement | null,
  annual: FinancialStatement | null,
  metric: MetricName,
): TrailingValue {
  const ttm = sumTtm(quarterly, metric);
  return ttm.value !== null ? ttm : latestAnnual(annual, metric);
}

/**
 * Trailing figure for a *stock* metric (balance-sheet items, which are levels
 * rather than flows): the most recent quarter-end if present, else year-end.
 * Never summed.
 */
export function trailingStock(
  quarterly: FinancialStatement | null,
  annual: FinancialStatement | null,
  metric: MetricName,
): TrailingValue {
  const fromQuarter = quarterly?.periods
    .filter((p) => isNum(p.metrics[metric]))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];

  if (fromQuarter) {
    return {
      value: fromQuarter.metrics[metric] as number,
      basis: 'ttm',
      asOf: fromQuarter.endDate,
    };
  }
  return latestAnnual(annual, metric);
}

/**
 * Average of the two most recent annual values — the denominator for ROE and
 * ROA, which compare a flow over a year against the equity/assets that
 * produced it. Falls back to the single available value.
 */
export function averageAnnual(
  statement: FinancialStatement | null,
  metric: MetricName,
): number | null {
  const series = annualSeries(statement, metric);
  if (series.length === 0) return null;
  if (series.length === 1) return series[0].value;
  const [a, b] = series.slice(-2);
  return (a.value + b.value) / 2;
}

/**
 * Compound annual growth rate as a fraction (0.24 = 24%/yr).
 *
 * Returns null when the starting value is not positive: a CAGR out of a loss
 * is not meaningful, and the book's growth categories assume real earnings.
 */
export function cagr(series: SeriesPoint[]): { value: number | null; years: number } {
  if (series.length < 2) return { value: null, years: 0 };
  const first = series[0];
  const last = series.at(-1)!;
  const years = yearsBetween(first.period, last.period);
  if (years <= 0 || first.value <= 0 || last.value <= 0) return { value: null, years };
  return { value: (last.value / first.value) ** (1 / years) - 1, years };
}

/** Year-over-year growth between the two most recent periods, as a fraction. */
export function latestGrowth(series: SeriesPoint[]): number | null {
  if (series.length < 2) return null;
  const [prev, last] = series.slice(-2);
  if (prev.value <= 0) return null;
  return last.value / prev.value - 1;
}

/**
 * Detects a definitional break in a series — a step so large it means the
 * company changed what it reports, not how it performed.
 *
 * Adyen is the case this exists for: revenue reads €8.94bn for 2022 and €1.86bn
 * for 2023, because it switched from gross to net revenue. A CAGR across that
 * step returns −33%/yr against real growth of about +20%. With only four or
 * five annual points, one break poisons the whole trend, so the engine suppress
 * es the trend rather than publishing a confident wrong number.
 *
 * The test is deliberately blunt: a year-on-year move beyond `factor` in either
 * direction, for a metric that does not plausibly move that far. Real collapses
 * do happen, which is why this marks the series as unreliable rather than
 * silently dropping points.
 */
export function detectSeriesBreak(
  series: SeriesPoint[],
  factor = 3,
): { hasBreak: boolean; at: string | null; from: number | null; to: number | null } {
  const none = { hasBreak: false, at: null, from: null, to: null };
  if (series.length < 2) return none;

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    const next = series[i].value;
    if (prev <= 0 || next <= 0) continue;

    const change = next / prev;
    if (change >= factor || change <= 1 / factor) {
      return { hasBreak: true, at: series[i].period, from: prev, to: next };
    }
  }
  return none;
}

/**
 * Trims a series back to the longest run that contains no definitional break,
 * keeping the most recent side — the figures still on the current basis.
 */
export function afterLastBreak(series: SeriesPoint[], factor = 3): SeriesPoint[] {
  const breakPoint = detectSeriesBreak(series, factor);
  if (!breakPoint.hasBreak || !breakPoint.at) return series;
  const index = series.findIndex((p) => p.period === breakPoint.at);
  return index === -1 ? series : series.slice(index);
}

export function yearsBetween(from: string, to: string): number {
  const ms = Date.parse(to) - Date.parse(from);
  return ms / (365.25 * 24 * 60 * 60 * 1000);
}

export interface DrawdownResult {
  /** Negative fraction: -0.62 means 62% below the high. */
  drawdown: number | null;
  high: number | null;
  highDate: string | null;
  /** Gain needed to reclaim the high — the book's "logarithmic waterfall". */
  recoveryNeeded: number | null;
}

/** Drawdown from the highest close in the window (section 5.18). */
export function drawdownFromHigh(
  history: PricePoint[],
  currentPrice: number | null,
): DrawdownResult {
  const empty: DrawdownResult = {
    drawdown: null,
    high: null,
    highDate: null,
    recoveryNeeded: null,
  };
  if (history.length === 0) return empty;

  let high = history[0];
  for (const point of history) if (point.close > high.close) high = point;

  const price = currentPrice ?? history.at(-1)?.close ?? null;
  if (price == null || high.close <= 0) return empty;

  return {
    drawdown: price / high.close - 1,
    high: high.close,
    highDate: high.date,
    recoveryNeeded: price > 0 ? high.close / price - 1 : null,
  };
}

/** Safe division that reports missing input rather than producing Infinity. */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}
