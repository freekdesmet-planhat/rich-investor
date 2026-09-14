/**
 * Why a company landed in its growth band.
 *
 * The page shows a Lynch category — high, average or low growth — and a single
 * fitted rate, and neither says anything about the shape that produced them.
 * A steady 12% a year and a collapse followed by a recovery averaging 12% carry
 * the same label and mean opposite things: the first is the book's "stalwart",
 * the second is the cyclical dip it warns you to read carefully. The trajectory
 * is that shape, drawn beside the fit.
 *
 * The fit here is the same least-squares regression on ln(y) that
 * `trendGrowth` performs — see `fundamentals.ts` for why an endpoint CAGR is
 * not used. This module exposes its intercept as well as its slope, which is
 * what a drawn curve needs and a single rate does not, and a test pins the two
 * to the same answer so the line on screen cannot drift from the number that
 * decided the category.
 */
import { yearsBetween, type SeriesPoint } from './fundamentals';

export interface LogLinearFit {
  /** Growth per year in log space; exp(slope) - 1 is the compound rate. */
  slope: number;
  intercept: number;
  /** The fitted value at a period, for drawing the curve through the bars. */
  at: (period: string) => number;
  /** The compound rate the fit implies — identical to `trendGrowth`'s value. */
  rate: number;
  pointsUsed: number;
}

/**
 * Least-squares fit of ln(value) against elapsed years.
 *
 * Null below three positive points, which is where `trendGrowth` also gives up
 * and falls back to endpoints: two points define a line exactly, so a "fit"
 * through them would be an endpoint CAGR wearing a regression's clothes.
 */
export function fitLogLinear(series: SeriesPoint[]): LogLinearFit | null {
  const usable = series.filter((p) => p.value > 0);
  if (usable.length < 3) return null;

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
  if (denominator === 0) return null;

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  const rate = Math.exp(slope) - 1;
  if (!Number.isFinite(rate)) return null;

  return {
    slope,
    intercept,
    rate,
    pointsUsed: n,
    at: (period: string) => Math.exp(intercept + slope * yearsBetween(origin, period)),
  };
}

export type GrowthBand = 'high_growth' | 'average_growth' | 'low_growth';

export interface TrajectoryPoint {
  period: string;
  value: number;
  /** Growth against the previous period; null for the first, or after a loss. */
  yoy: number | null;
  /** The fitted curve at this period, null where no fit was possible. */
  fitted: number | null;
  /** A year earnings went backwards — the shape a single rate hides. */
  dip: boolean;
}

export interface Trajectory {
  points: TrajectoryPoint[];
  /** The fitted compound rate, or null when the series could not carry a fit. */
  rate: number | null;
  /** The endpoint CAGR, for contrast: one distorted year sets the whole rate. */
  endpointCagr: number | null;
  /** Years in which earnings fell. */
  dips: number;
  /** The steepest single-year fall, as a negative fraction. */
  worstDip: number | null;
  /** Spread of year-on-year growth: how far the shape strays from the line. */
  volatility: number | null;
  band: GrowthBand | null;
}

export interface GrowthBands {
  /** Fitted rate at or above this is high growth. */
  highGrowth: number;
  /** Fitted rate at or above this is average growth. */
  averageGrowth: number;
}

/** Which band a rate falls in, ignoring the tolerance zone the engine applies. */
export function bandFor(rate: number | null, bands: GrowthBands): GrowthBand | null {
  if (rate == null) return null;
  if (rate >= bands.highGrowth) return 'high_growth';
  if (rate >= bands.averageGrowth) return 'average_growth';
  return 'low_growth';
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * The series, its year-on-year steps and the fitted curve through them.
 *
 * `rate` is taken from the caller when the engine already computed one, so the
 * panel reports the figure the classification actually used rather than a
 * second one computed here from a possibly different window.
 */
export function buildTrajectory(
  series: SeriesPoint[],
  options: { rate?: number | null; endpointCagr?: number | null; bands: GrowthBands },
): Trajectory | null {
  if (series.length < 2) return null;

  const fit = fitLogLinear(series);
  const rate = options.rate ?? fit?.rate ?? null;

  const points: TrajectoryPoint[] = series.map((point, i) => {
    const previous = i > 0 ? series[i - 1] : null;
    // A step out of a loss is not a growth rate — the base is meaningless — so
    // it is left blank rather than printed as a spectacular percentage.
    const yoy = previous && previous.value > 0 ? point.value / previous.value - 1 : null;

    return {
      period: point.period,
      value: point.value,
      yoy,
      fitted: fit && point.value > 0 ? fit.at(point.period) : null,
      dip: yoy != null && yoy < 0,
    };
  });

  const steps = points.map((p) => p.yoy).filter((y): y is number => y != null);

  return {
    points,
    rate,
    endpointCagr: options.endpointCagr ?? null,
    dips: steps.filter((y) => y < 0).length,
    worstDip: steps.length > 0 ? Math.min(...steps, 0) || null : null,
    volatility: stdDev(steps),
    band: bandFor(rate, options.bands),
  };
}
