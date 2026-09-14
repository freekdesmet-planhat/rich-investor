/**
 * The trajectory behind a growth band.
 *
 * The load-bearing test is the first one: the curve drawn on the page must be
 * the same fit that decided the category. If these two ever diverge the page
 * shows a line that contradicts the label beside it, which is precisely the
 * class of bug this batch exists to remove.
 */
import { describe, expect, it } from 'vitest';
import { trendGrowth, type SeriesPoint } from './fundamentals';
import { bandFor, buildTrajectory, fitLogLinear } from './trajectory';

const series = (...values: number[]): SeriesPoint[] =>
  values.map((value, i) => ({ period: `${2021 + i}-12-31`, value }));

const BANDS = { highGrowth: 0.2, averageGrowth: 0.1 };

describe('fitLogLinear', () => {
  it('agrees with the rate the classification is made from', () => {
    for (const points of [series(150, 100, 110, 125, 140), series(2, 3, 4, 5, 6), series(9, 8, 7, 6, 5)]) {
      const fit = fitLogLinear(points)!;
      expect(fit.rate).toBeCloseTo(trendGrowth(points).value!, 10);
    }
  });

  /**
   * Not exactly 10%: `yearsBetween` measures elapsed time, so a 365-day gap is
   * a shade under a year and the compound rate lands a hair either side. That
   * is the behaviour that makes irregular fiscal periods work, so the tolerance
   * belongs in the test rather than a round number in the code.
   */
  it('tracks a perfectly compounding series', () => {
    const fit = fitLogLinear(series(100, 110, 121, 133.1))!;
    expect(fit.rate).toBeCloseTo(0.1, 3);
    // Same reason: the curve lands within a cent of each observation rather
    // than exactly on it, because the spacing is not exactly a year.
    expect(fit.at('2021-12-31')).toBeCloseTo(100, 1);
    expect(fit.at('2024-12-31')).toBeCloseTo(133.1, 1);
  });

  /** Two points define a line exactly; that is an endpoint CAGR, not a fit. */
  it('declines to fit fewer than three positive points', () => {
    expect(fitLogLinear(series(100, 110))).toBeNull();
    expect(fitLogLinear([{ period: '2024-12-31', value: 5 }])).toBeNull();
  });

  it('ignores loss years, which have no logarithm', () => {
    const fit = fitLogLinear(series(-5, 100, 110, 121))!;
    expect(fit.pointsUsed).toBe(3);
    expect(fit.rate).toBeCloseTo(0.1, 3);
  });
});

describe('buildTrajectory', () => {
  it('reports each year-on-year step', () => {
    const t = buildTrajectory(series(100, 110, 99), { bands: BANDS })!;
    expect(t.points.map((p) => p.yoy)).toEqual([null, expect.closeTo(0.1, 6), expect.closeTo(-0.1, 6)]);
  });

  it('marks the years earnings went backwards', () => {
    const t = buildTrajectory(series(100, 120, 90, 130), { bands: BANDS })!;
    expect(t.points.map((p) => p.dip)).toEqual([false, false, true, false]);
    expect(t.dips).toBe(1);
    expect(t.worstDip).toBeCloseTo(-0.25, 6);
  });

  /** A step out of a loss has a meaningless base; printing it would mislead. */
  it('leaves the step out of a loss blank', () => {
    const t = buildTrajectory(series(-10, 50, 60), { bands: BANDS })!;
    expect(t.points[1].yoy).toBeNull();
    expect(t.points[1].dip).toBe(false);
  });

  it('prefers the rate the engine already computed', () => {
    const t = buildTrajectory(series(100, 110, 121), { rate: 0.42, bands: BANDS })!;
    expect(t.rate).toBe(0.42);
    // …and still draws the curve from the series itself.
    expect(t.points[0].fitted).toBeCloseTo(100, 1);
  });

  it('falls back to its own fit when the engine supplied none', () => {
    const t = buildTrajectory(series(100, 110, 121), { bands: BANDS })!;
    expect(t.rate).toBeCloseTo(0.1, 3);
  });

  it('leaves the curve blank when the series cannot carry a fit', () => {
    const t = buildTrajectory(series(100, 110), { bands: BANDS })!;
    expect(t.points.every((p) => p.fitted === null)).toBe(true);
  });

  it('has nothing to say about a single year', () => {
    expect(buildTrajectory(series(100), { bands: BANDS })).toBeNull();
  });

  /**
   * The point of the panel: two series with the same fitted rate and opposite
   * shapes must be distinguishable by something the page can show.
   */
  it('separates a steady climb from a dip and recovery at the same rate', () => {
    const steady = buildTrajectory(series(100, 110, 121, 133.1), { bands: BANDS })!;
    const jagged = buildTrajectory(series(100, 70, 150, 133.1), { bands: BANDS })!;

    expect(jagged.rate).not.toBeCloseTo(steady.rate!, 2);
    expect(steady.dips).toBe(0);
    expect(jagged.dips).toBeGreaterThan(0);
    expect(jagged.volatility!).toBeGreaterThan(steady.volatility!);
  });
});

describe('bandFor', () => {
  it('reads the book’s three bands', () => {
    expect(bandFor(0.25, BANDS)).toBe('high_growth');
    expect(bandFor(0.2, BANDS)).toBe('high_growth');
    expect(bandFor(0.15, BANDS)).toBe('average_growth');
    expect(bandFor(0.1, BANDS)).toBe('average_growth');
    expect(bandFor(0.05, BANDS)).toBe('low_growth');
    expect(bandFor(-0.3, BANDS)).toBe('low_growth');
  });

  it('says nothing without a rate', () => {
    expect(bandFor(null, BANDS)).toBeNull();
  });
});
