/**
 * The company's own valuation history.
 *
 * The case worth protecting is the reporting lag. Without it the series uses
 * earnings nobody had yet, and the points that look cheapest are exactly the
 * ones that could not have been acted on — which is the most flattering way
 * a backtest can lie.
 */
import { describe, expect, it } from 'vitest';
import { peHistory, summariseValuation, REPORTING_LAG_DAYS } from './valuationHistory';

/** FY2024 earned 4, FY2025 earned 10. Both fiscal years end 31 December. */
const eps = [
  { period: '2024-12-31', value: 4 },
  { period: '2025-12-31', value: 10 },
];

describe('peHistory', () => {
  it('divides the close by the earnings published at the time', () => {
    const points = peHistory([{ date: '2025-06-30', close: 80 }], eps);
    // FY2024's 4 was public by March 2025; FY2025's 10 was not.
    expect(points).toEqual([{ date: '2025-06-30', pe: 20 }]);
  });

  /**
   * The whole point of the lag. On 2026-01-05 the company has *earned* 10,
   * but has not reported it — the market is still valuing it on 4.
   */
  it('does not use earnings before they were filed', () => {
    const justAfterYearEnd = peHistory([{ date: '2026-01-05', close: 80 }], eps);
    expect(justAfterYearEnd[0].pe).toBe(20);

    const afterTheFiling = peHistory([{ date: '2026-04-01', close: 80 }], eps);
    expect(afterTheFiling[0].pe).toBe(8);
  });

  it('steps to the new figure once the lag has passed', () => {
    // FY2025 ends 31 December, so it becomes available on 2026-03-16. At a
    // flat price of 40 the multiple halves overnight, because the
    // denominator did — that step is the series being honest about when the
    // market learned something.
    const points = peHistory(
      [
        { date: '2026-03-10', close: 40 },
        { date: '2026-03-20', close: 40 },
      ],
      eps,
    );
    expect(points.map((p) => p.pe)).toEqual([10, 4]);
  });

  /**
   * 2025-01-01 is after FY2024 ended but before it was filed, so there is
   * nothing to divide by yet and the point is dropped rather than guessed.
   */
  it('has no figure between a year ending and its filing', () => {
    expect(peHistory([{ date: '2025-01-01', close: 40 }], eps)).toEqual([]);
  });

  it('has nothing to say before the first earnings were published', () => {
    expect(peHistory([{ date: '2023-01-01', close: 40 }], eps)).toEqual([]);
  });

  /** A P/E out of a loss is not a valuation, and would set the whole range. */
  it('drops points where earnings were negative or zero', () => {
    const withLoss = [
      { period: '2024-12-31', value: -2 },
      { period: '2025-12-31', value: 0 },
    ];
    expect(peHistory([{ date: '2026-06-01', close: 80 }], withLoss)).toEqual([]);
  });

  it('ignores an unusable close', () => {
    const points = peHistory(
      [
        { date: '2025-06-30', close: 0 },
        { date: 'not-a-date', close: 80 },
        { date: '2025-07-01', close: 80 },
      ],
      eps,
    );
    expect(points).toEqual([{ date: '2025-07-01', pe: 20 }]);
  });

  it('survives having nothing to work with', () => {
    expect(peHistory([], eps)).toEqual([]);
    expect(peHistory([{ date: '2025-06-30', close: 80 }], [])).toEqual([]);
  });

  it('states the lag once, rather than leaving it a magic number', () => {
    expect(REPORTING_LAG_DAYS).toBe(75);
  });
});

describe('summariseValuation', () => {
  const points = [10, 20, 30, 40, 50].map((pe, i) => ({ date: `2025-0${i + 1}-01`, pe }));

  it('reports the range and the median', () => {
    const range = summariseValuation(points, 30)!;
    expect(range).toMatchObject({ min: 10, median: 30, max: 50, current: 30 });
  });

  /** A low percentile is the interesting one: cheap against its own history. */
  it('places today inside its own history', () => {
    expect(summariseValuation(points, 10)!.percentile).toBe(20);
    expect(summariseValuation(points, 30)!.percentile).toBe(60);
    expect(summariseValuation(points, 50)!.percentile).toBe(100);
  });

  it('gives no percentile when there is no current multiple to place', () => {
    expect(summariseValuation(points, null)!.percentile).toBeNull();
    expect(summariseValuation(points, -4)!.percentile).toBeNull();
  });

  it('returns nothing rather than an empty range', () => {
    expect(summariseValuation([], 20)).toBeNull();
  });
});
