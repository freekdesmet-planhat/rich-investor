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
 * Average of a balance-sheet level over the period the numerator covers.
 *
 * Return ratios divide a flow by the base that produced it, so the two must
 * span the same window. Pairing a TTM numerator with the average of the last
 * two *annual* balance sheets leaves the numerator running months ahead of the
 * denominator, which understates the base badly for a fast-growing company:
 * NVDA's ROA came out at 121% because $192.9bn of trailing profit was divided
 * by an asset base last measured at the start of that run.
 *
 * When the numerator is TTM and quarterly balances are available, the average
 * is taken over the matching four-quarter span instead.
 */
export function averageForBasis(
  quarterly: FinancialStatement | null,
  annual: FinancialStatement | null,
  metric: MetricName,
  basis: Basis,
): number | null {
  if (basis === 'ttm' && quarterly) {
    const points = quarterly.periods
      .filter((p) => isNum(p.metrics[metric]))
      .sort((a, b) => b.endDate.localeCompare(a.endDate));

    // Newest and the one four quarters back: the two ends of the TTM window.
    if (points.length >= 5) {
      const latest = points[0].metrics[metric] as number;
      const yearAgo = points[4].metrics[metric] as number;
      return (latest + yearAgo) / 2;
    }
    if (points.length >= 2) {
      const latest = points[0].metrics[metric] as number;
      const oldest = points[points.length - 1].metrics[metric] as number;
      return (latest + oldest) / 2;
    }
  }
  return averageAnnual(annual, metric);
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

export interface GrowthResult {
  value: number | null;
  years: number;
  /** 'lsgr' when every point shaped the answer, 'endpoints' on the fallback. */
  method: 'lsgr' | 'endpoints' | 'none';
  /** Points that actually entered the fit. */
  pointsUsed: number;
  /** Endpoint CAGR, kept alongside so the two can be compared on the card. */
  endpointCagr: number | null;
}

/**
 * Compound growth rate fitted by least squares over the log of the series.
 *
 * An endpoint CAGR reads only its first and last value, so a single distorted
 * year sets the entire rate: AMD's 2020 EPS carries a one-off deferred-tax
 * release and drags its 5-year rate to +5.2%, and AVGO's window opens on a
 * spike and closes on acquisition charges, giving -5.5% — - neither of which
 * describes what those businesses did over the period.
 *
 * Fitting ln(y) = b*x + a and taking exp(b) - 1 gives a compound rate in the
 * same units, but one that every observation contributes to, so an outlier at
 * either end moves it rather than defining it. The book's own warning that
 * single-year figures say little and multi-year trends say everything is an
 * argument for exactly this.
 *
 * Logs need positive values, so non-positive points are dropped; with fewer
 * than three left the endpoint CAGR is used instead and the method says so.
 */
export function trendGrowth(series: SeriesPoint[]): GrowthResult {
  const endpoint = cagr(series);
  const usable = series.filter((p) => p.value > 0);

  if (usable.length < 3) {
    return {
      value: endpoint.value,
      years: endpoint.years,
      method: endpoint.value == null ? 'none' : 'endpoints',
      pointsUsed: usable.length,
      endpointCagr: endpoint.value,
    };
  }

  // x is elapsed years from the first usable point, so irregular fiscal
  // periods are handled correctly rather than assumed evenly spaced.
  const origin = usable[0].period;
  const xs = usable.map((p) => yearsBetween(origin, p.period));
  const ys = usable.map((p) => Math.log(p.value));

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }

  if (denominator === 0) {
    return {
      value: endpoint.value,
      years: endpoint.years,
      method: endpoint.value == null ? 'none' : 'endpoints',
      pointsUsed: n,
      endpointCagr: endpoint.value,
    };
  }

  const slope = numerator / denominator;
  const value = Math.exp(slope) - 1;

  return {
    value: Number.isFinite(value) ? value : null,
    years: xs[n - 1] - xs[0],
    method: 'lsgr',
    pointsUsed: n,
    endpointCagr: endpoint.value,
  };
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
