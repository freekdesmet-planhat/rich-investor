/**
 * The arithmetic behind a readable price chart.
 *
 * The cases that matter are the ones where a plausible shortcut would mislead:
 * a range measured from today rather than from the data, an axis whose top tick
 * sits above anything actually drawn, and a drawdown computed against a high
 * that is missing or zero.
 */
import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  drawdownFrom,
  entryLevel,
  nearestIndex,
  pointsInRange,
  type PricePoint,
} from './priceRange';

const series = (...dates: string[]): PricePoint[] =>
  dates.map((date, i) => ({ date, close: 100 + i }));

describe('pointsInRange', () => {
  const points = series(
    '2021-01-04',
    '2022-06-01',
    '2024-09-02',
    '2025-03-03',
    '2026-01-05',
    '2026-09-11',
  );

  it('keeps everything for the full range', () => {
    expect(pointsInRange(points, 'max')).toHaveLength(points.length);
  });

  /** Measured from the last observation, so a stale series shows its own year. */
  it('measures the window back from the most recent point, not from today', () => {
    const oneYear = pointsInRange(points, '1y');
    expect(oneYear.map((p) => p.date)).toEqual(['2026-01-05', '2026-09-11']);
  });

  it('widens with the range', () => {
    expect(pointsInRange(points, '3y').length).toBeGreaterThan(pointsInRange(points, '1y').length);
    expect(pointsInRange(points, '5y').length).toBeGreaterThanOrEqual(
      pointsInRange(points, '3y').length,
    );
  });

  /** A window holding one point draws nothing; the whole series says more. */
  it('falls back to everything when the window cannot draw a line', () => {
    const sparse = series('2019-01-01', '2026-09-11');
    expect(pointsInRange(sparse, '1y')).toHaveLength(2);
  });

  it('copes with an empty series', () => {
    expect(pointsInRange([], '1y')).toEqual([]);
  });
});

describe('axisTicks', () => {
  it('spans exactly what is drawn, top first', () => {
    expect(axisTicks(10, 20, 3)).toEqual([20, 15, 10]);
  });

  /**
   * No rounding to "nice" numbers: a tick above the highest point would claim
   * the line reached a level it never did.
   */
  it('never reaches beyond the data', () => {
    const ticks = axisTicks(103.7, 291.2, 4);
    expect(Math.max(...ticks)).toBeCloseTo(291.2, 6);
    expect(Math.min(...ticks)).toBeCloseTo(103.7, 6);
  });

  it('has nothing to divide when the series is flat', () => {
    expect(axisTicks(50, 50)).toEqual([50]);
  });

  it('refuses nonsense rather than emitting NaN', () => {
    expect(axisTicks(Number.NaN, 10)).toEqual([]);
  });
});

describe('drawdownFrom', () => {
  it('reads as a negative fraction of the high', () => {
    expect(drawdownFrom(1000, 500)).toBeCloseTo(-0.5, 10);
    expect(drawdownFrom(2746.5, 951.5)).toBeCloseTo(-0.6535, 3);
  });

  it('is zero at the high itself', () => {
    expect(drawdownFrom(1000, 1000)).toBe(0);
  });

  it('says nothing without a usable high', () => {
    expect(drawdownFrom(null, 500)).toBeNull();
    expect(drawdownFrom(0, 500)).toBeNull();
    expect(drawdownFrom(1000, null)).toBeNull();
  });
});

describe('entryLevel', () => {
  it('is the price at which the decline reaches the threshold', () => {
    expect(entryLevel(1000)).toBe(500);
    expect(entryLevel(2746.5)).toBeCloseTo(1373.25, 6);
  });

  it('follows a different threshold when given one', () => {
    expect(entryLevel(1000, 0.3)).toBeCloseTo(700, 6);
  });

  it('says nothing without a high', () => {
    expect(entryLevel(null)).toBeNull();
    expect(entryLevel(0)).toBeNull();
  });
});

describe('nearestIndex', () => {
  const points = series('a', 'b', 'c', 'd', 'e');

  it('maps a position across the plot to the closest sample', () => {
    expect(nearestIndex(points, 0)).toBe(0);
    expect(nearestIndex(points, 1)).toBe(4);
    expect(nearestIndex(points, 0.5)).toBe(2);
  });

  it('clamps a pointer that leaves the plot', () => {
    expect(nearestIndex(points, -2)).toBe(0);
    expect(nearestIndex(points, 9)).toBe(4);
  });

  it('has no answer for an empty series', () => {
    expect(nearestIndex([], 0.5)).toBe(-1);
  });
});
