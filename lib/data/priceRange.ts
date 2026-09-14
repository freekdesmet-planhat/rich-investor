/**
 * Reading a price chart.
 *
 * The chart drew five years as a single line with a dashed high across it and
 * nothing else: no axis, so no value could be read off it; no range control, so
 * a recent move was invisible inside five years of history; and no mark for the
 * 50% decline that is the book's entry signal — the one level the whole page is
 * judging the price against.
 *
 * The arithmetic of all that lives here, away from the SVG, because "which
 * points fall in the last year" and "what are sensible axis labels" are
 * questions with right answers that should not need a browser to check.
 */

export type ChartRange = '1y' | '3y' | '5y' | 'max';

export const CHART_RANGES: ChartRange[] = ['1y', '3y', '5y', 'max'];

export const isChartRange = (value: unknown): value is ChartRange =>
  typeof value === 'string' && (CHART_RANGES as string[]).includes(value);

const YEARS: Record<Exclude<ChartRange, 'max'>, number> = { '1y': 1, '3y': 3, '5y': 5 };

export interface PricePoint {
  date: string;
  close: number;
}

/**
 * The points inside a range, measured back from the most recent one.
 *
 * Back from the last observation rather than from today: a stale series should
 * show its own last year, not an empty window ending now.
 */
export function pointsInRange(points: PricePoint[], range: ChartRange): PricePoint[] {
  if (range === 'max' || points.length === 0) return points;

  const last = points[points.length - 1];
  const end = Date.parse(last.date);
  if (Number.isNaN(end)) return points;

  const cutoff = new Date(end);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - YEARS[range]);

  const inside = points.filter((p) => {
    const t = Date.parse(p.date);
    return !Number.isNaN(t) && t >= cutoff.getTime();
  });

  // Two points are the minimum a line needs; below that the range is not
  // showing anything and the full series is more honest than an empty box.
  return inside.length >= 2 ? inside : points;
}

/**
 * Evenly spaced axis values covering a span.
 *
 * Deliberately not "nice" rounded numbers: the axis exists so a reader can put
 * a value on the line, and a rounded tick that sits above the highest point or
 * below the lowest would misreport the extent of what is drawn.
 */
export function axisTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (count < 2) return [max];
  if (max === min) return [max];

  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i).reverse();
}

/**
 * How far below the high the price sits, as a negative fraction.
 *
 * Null when there is no high to measure against, or it is not a positive
 * number — a percentage of zero says nothing.
 */
export function drawdownFrom(high: number | null, close: number | null): number | null {
  if (high == null || close == null || high <= 0) return null;
  return close / high - 1;
}

/** The price at which a decline reaches the book's entry threshold. */
export function entryLevel(high: number | null, threshold = 0.5): number | null {
  if (high == null || high <= 0) return null;
  return high * (1 - threshold);
}

/** The sample nearest a horizontal position, as a fraction across the plot. */
export function nearestIndex(points: PricePoint[], fraction: number): number {
  if (points.length === 0) return -1;
  const clamped = Math.min(1, Math.max(0, fraction));
  return Math.round(clamped * (points.length - 1));
}
