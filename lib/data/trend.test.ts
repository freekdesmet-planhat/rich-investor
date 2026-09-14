/**
 * Reading the stored evaluations as movement.
 *
 * The cases that matter are the ones where a naive reading would mislead: a
 * single evaluation is not a trend, a re-run on the same day is not a second
 * data point, and a condition that stopped being applicable did not "fail".
 */
import { describe, expect, it } from 'vitest';
import {
  buildTrend,
  conditionChanges,
  hasMoved,
  movers,
  within,
  windowStart,
  type TrendPoint,
} from './trend';

const point = (
  as_of: string,
  conditions_met: number,
  status: TrendPoint['status'] = 'watching',
): TrendPoint => ({ as_of, conditions_met, conditions_applicable: 9, status });

describe('buildTrend', () => {
  it('orders the points oldest first, whatever order they arrive in', () => {
    const trend = buildTrend('ADBE', [point('2026-09-10', 7), point('2026-09-01', 6)])!;
    expect(trend.points.map((p) => p.as_of)).toEqual(['2026-09-01', '2026-09-10']);
    expect(trend.latest.as_of).toBe('2026-09-10');
  });

  it('measures the change against the oldest evaluation in the window', () => {
    const trend = buildTrend('ADBE', [point('2026-06-12', 6), point('2026-09-10', 8)])!;
    expect(trend.reference?.as_of).toBe('2026-06-12');
    expect(trend.delta).toBe(2);
  });

  /** A single evaluation is a snapshot; calling it a trend would invent one. */
  it('has no reference and no delta from one evaluation', () => {
    const trend = buildTrend('ADBE', [point('2026-09-10', 8)])!;
    expect(trend.reference).toBeNull();
    expect(trend.delta).toBe(0);
    expect(hasMoved(trend)).toBe(false);
  });

  it('says nothing at all when there is no history', () => {
    expect(buildTrend('ADBE', [])).toBeNull();
  });

  /** The nightly job can be re-run; the last write for a day is the one that stood. */
  it('keeps one point per day', () => {
    const trend = buildTrend('ADBE', [
      point('2026-09-10', 6),
      point('2026-09-10', 8),
      point('2026-09-11', 8),
    ])!;
    expect(trend.points).toHaveLength(2);
    expect(trend.points[0].conditions_met).toBe(8);
  });

  it('reports the status it used to hold, and only when it differs', () => {
    const promoted = buildTrend('ADBE', [
      point('2026-09-01', 7, 'watching'),
      point('2026-09-10', 9, 'buy_worthy'),
    ])!;
    expect(promoted.from).toBe('watching');

    const steady = buildTrend('MSFT', [
      point('2026-09-01', 7, 'watching'),
      point('2026-09-10', 7, 'watching'),
    ])!;
    expect(steady.from).toBeNull();
    expect(hasMoved(steady)).toBe(false);
  });

  it('counts a status change as movement even when the count held', () => {
    const trend = buildTrend('ADBE', [
      point('2026-09-01', 8, 'watching'),
      point('2026-09-10', 8, 'almost'),
    ])!;
    expect(trend.delta).toBe(0);
    expect(hasMoved(trend)).toBe(true);
  });
});

describe('movers', () => {
  const trend = (symbol: string, from: TrendPoint, to: TrendPoint) => buildTrend(symbol, [from, to])!;

  it('leaves out everything that stood still', () => {
    const list = movers([
      trend('A', point('2026-09-01', 7), point('2026-09-10', 7)),
      trend('B', point('2026-09-01', 6), point('2026-09-10', 8)),
    ]);
    expect(list.map((t) => t.symbol)).toEqual(['B']);
  });

  it('puts a promotion first, however small the count moved', () => {
    const list = movers([
      trend('BIG', point('2026-09-01', 3), point('2026-09-10', 7)),
      trend('UP', point('2026-09-01', 8, 'almost'), point('2026-09-10', 9, 'buy_worthy')),
    ]);
    expect(list.map((t) => t.symbol)).toEqual(['UP', 'BIG']);
  });

  it('then orders by how far it travelled', () => {
    const list = movers([
      trend('ONE', point('2026-09-01', 6), point('2026-09-10', 7)),
      trend('THREE', point('2026-09-01', 4), point('2026-09-10', 7)),
    ]);
    expect(list.map((t) => t.symbol)).toEqual(['THREE', 'ONE']);
  });

  /** A name quietly shedding conditions is the other thing worth being told. */
  it('keeps losses, ranked after equal-sized gains', () => {
    const list = movers([
      trend('DOWN', point('2026-09-01', 8), point('2026-09-10', 6)),
      trend('UP', point('2026-09-01', 6), point('2026-09-10', 8)),
    ]);
    expect(list.map((t) => t.symbol)).toEqual(['UP', 'DOWN']);
    expect(list[1].delta).toBe(-2);
  });

  it('sinks a demotion below everything that did not fall', () => {
    const list = movers([
      trend('FELL', point('2026-09-01', 9, 'buy_worthy'), point('2026-09-10', 8, 'almost')),
      trend('ROSE', point('2026-09-01', 5), point('2026-09-10', 6)),
    ]);
    expect(list.map((t) => t.symbol)).toEqual(['ROSE', 'FELL']);
  });
});

describe('windowStart', () => {
  it('reaches back the given number of days, as a stored date', () => {
    expect(windowStart(7, new Date('2026-09-14T12:00:00Z'))).toBe('2026-09-07');
    expect(windowStart(90, new Date('2026-09-14T12:00:00Z'))).toBe('2026-06-16');
  });
});

describe('conditionChanges', () => {
  const state = (key: string, passed: boolean, applicable = true) => ({ key, passed, applicable });

  it('names what started and stopped passing', () => {
    const changes = conditionChanges(
      [state('peg', false), state('roe', true), state('debt', true)],
      [state('peg', true), state('roe', false), state('debt', true)],
    );
    expect(changes).toEqual([
      { key: 'peg', gained: true },
      { key: 'roe', gained: false },
    ]);
  });

  /** Becoming not-applicable is a change in the rules, not in the company. */
  it('ignores a condition that stopped applying', () => {
    expect(
      conditionChanges([state('ev_ebit', true)], [state('ev_ebit', false, false)]),
    ).toEqual([]);
    expect(
      conditionChanges([state('ev_ebit', false, false)], [state('ev_ebit', true)]),
    ).toEqual([]);
  });

  it('ignores a condition that is new to the checklist', () => {
    expect(conditionChanges([], [state('peg', true)])).toEqual([]);
  });

  it('has nothing to say when nothing flipped', () => {
    expect(conditionChanges([state('peg', true)], [state('peg', true)])).toEqual([]);
  });
});

describe('within', () => {
  const trend = buildTrend('ADBE', [
    point('2026-06-12', 6),
    point('2026-09-08', 7),
    point('2026-09-13', 8),
  ])!;
  const now = new Date('2026-09-14T12:00:00Z');

  it('drops what falls outside the window', () => {
    // 2026-06-12 is 94 days before `now`, so a 90-day window cannot reach it.
    expect(within(trend, 90, now)!.points.map((p) => p.as_of)).toEqual([
      '2026-09-08',
      '2026-09-13',
    ]);
  });

  it('narrows to the window without refetching', () => {
    const week = within(trend, 7, now)!;
    expect(week.points.map((p) => p.as_of)).toEqual(['2026-09-08', '2026-09-13']);
    expect(week.delta).toBe(1);
  });

  it('keeps the long view intact', () => {
    const quarter = within(trend, 120, now)!;
    expect(quarter.delta).toBe(2);
    expect(quarter.reference?.as_of).toBe('2026-06-12');
  });

  /** A window holding one evaluation reports no movement, not a fake one. */
  it('reports no movement when the window holds a single evaluation', () => {
    const day = within(trend, 1, now)!;
    expect(day.points).toHaveLength(1);
    expect(day.delta).toBe(0);
    expect(hasMoved(day)).toBe(false);
  });

  it('is null when the window is empty', () => {
    expect(within(trend, 0, new Date('2027-01-01T00:00:00Z'))).toBeNull();
  });
});
