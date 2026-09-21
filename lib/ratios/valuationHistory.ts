import type { SeriesPoint } from './fundamentals';

/**
 * What this company has historically been worth, by its own standards.
 *
 * The drawdown condition says how far the price has fallen from its own high.
 * That is a fact about the price and nothing else: a company whose earnings
 * have doubled can be 30% off its high and more expensive than it has ever
 * been. This is the other half — where today's multiple sits against the
 * range this company has actually traded at.
 *
 * Built from daily closes and annual diluted EPS, which makes it a step
 * function: the price moves every day and the denominator moves once a year.
 * Quarterly statements would give a rolling twelve-month figure and a smooth
 * line, but coverage runs to five or six quarters against the five years of
 * prices, so a TTM series would be smooth for eighteen months and absent for
 * the rest. A step function that is right is better than a curve that is
 * invented.
 */

/**
 * How long after a fiscal year ends before its earnings are public.
 *
 * Without this the series would use figures nobody had yet. A fiscal year
 * ending 30 September is not filed until some weeks later, and dividing
 * September's price by it would show a P/E that could not have been computed
 * until November — the cheapest-looking points in the series would be
 * precisely the ones nobody could have acted on.
 *
 * Seventy-five days is the outside edge of the SEC's own deadline for a
 * large accelerated filer's 10-K, so it errs towards using the *older*
 * figure. Erring the other way would reintroduce the look-ahead this exists
 * to remove.
 */
export const REPORTING_LAG_DAYS = 75;

export interface ValuationPoint {
  date: string;
  pe: number;
}

export interface ValuationRange {
  points: ValuationPoint[];
  current: number | null;
  min: number;
  median: number;
  max: number;
  /**
   * Where `current` sits in its own history, 0–100. Zero means the cheapest
   * this company has been on this measure in five years.
   */
  percentile: number | null;
}

const addDays = (iso: string, days: number): number =>
  new Date(iso).getTime() + days * 86_400_000;

/**
 * Trailing P/E at each close, using the newest earnings published by then.
 *
 * Non-positive EPS produces no point rather than a negative or enormous one:
 * a P/E out of a loss is not a valuation, and one loss-making year would
 * otherwise set the whole range.
 */
export function peHistory(
  prices: Array<{ date: string; close: number }>,
  epsSeries: SeriesPoint[],
  lagDays: number = REPORTING_LAG_DAYS,
): ValuationPoint[] {
  if (prices.length === 0 || epsSeries.length === 0) return [];

  // Oldest first, so the scan below can walk forward through them.
  const published = epsSeries
    .map((point) => ({ availableFrom: addDays(point.period, lagDays), eps: point.value }))
    .sort((a, b) => a.availableFrom - b.availableFrom);

  const points: ValuationPoint[] = [];

  for (const { date, close } of prices) {
    const at = new Date(date).getTime();
    if (Number.isNaN(at) || !(close > 0)) continue;

    let eps: number | null = null;
    for (const candidate of published) {
      if (candidate.availableFrom > at) break;
      eps = candidate.eps;
    }

    if (eps === null || eps <= 0) continue;
    points.push({ date, pe: close / eps });
  }

  return points;
}

const quantile = (sorted: number[], fraction: number): number => {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

/**
 * The range, and where today sits inside it.
 *
 * `percentile` is the share of history at or below the current multiple, so
 * a low number is the interesting one: it means the company is cheaper on its
 * own earnings than it has usually been. Deliberately not a verdict — the
 * nine conditions decide that — but it is the context the drawdown figure
 * alone cannot give.
 */
export function summariseValuation(
  points: ValuationPoint[],
  current: number | null,
): ValuationRange | null {
  if (points.length === 0) return null;

  const values = points.map((p) => p.pe).sort((a, b) => a - b);
  const percentile =
    current != null && current > 0
      ? (values.filter((v) => v <= current).length / values.length) * 100
      : null;

  return {
    points,
    current,
    min: values[0],
    median: quantile(values, 0.5),
    max: values[values.length - 1],
    percentile,
  };
}
