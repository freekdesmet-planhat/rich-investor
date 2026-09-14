/**
 * What has changed since last time.
 *
 * Every page in the app is a snapshot. The nightly job has been storing one
 * `signal_history` row per ticker per day since the beginning, and none of it
 * was ever read back — so a stock that climbed from six conditions to eight
 * over three months looked exactly like one that had sat at eight all along.
 * That climb is the whole signal: the book's premise is that a quality name
 * occasionally falls and then recovers, and the recovery is visible in the
 * count long before it shows up as a status change.
 *
 * Pure, and given its own module rather than living in `queries.ts`, which
 * carries the `server-only` guard a unit test cannot load.
 */

export type SignalStatus = 'buy_worthy' | 'almost' | 'watching';

/** One stored evaluation, reduced to what a trend needs. */
export interface TrendPoint {
  as_of: string;
  conditions_met: number;
  conditions_applicable: number;
  status: SignalStatus;
}

export interface Trend {
  symbol: string;
  /** Oldest first, so it reads left to right like the chart it becomes. */
  points: TrendPoint[];
  latest: TrendPoint;
  /**
   * The oldest evaluation still inside the window — what "since" refers to.
   * Null when the window holds a single evaluation and there is nothing to
   * compare against yet.
   */
  reference: TrendPoint | null;
  /** Conditions gained (positive) or lost (negative) since the reference. */
  delta: number;
  /** The status it held at the reference, when that differs from today's. */
  from: SignalStatus | null;
}

const RANK: Record<SignalStatus, number> = { watching: 0, almost: 1, buy_worthy: 2 };

/**
 * Builds one ticker's trend from its stored evaluations.
 *
 * Rows may arrive in any order and may contain more than one entry per day
 * (a re-run), so they are sorted and deduplicated on the date — the last write
 * for a day is the evaluation that stood.
 */
export function buildTrend(symbol: string, rows: TrendPoint[]): Trend | null {
  const byDate = new Map<string, TrendPoint>();
  for (const row of rows) byDate.set(row.as_of, row);

  const points = [...byDate.values()].sort((a, b) => a.as_of.localeCompare(b.as_of));
  if (points.length === 0) return null;

  const latest = points[points.length - 1];
  const reference = points.length > 1 ? points[0] : null;

  return {
    symbol,
    points,
    latest,
    reference,
    delta: reference ? latest.conditions_met - reference.conditions_met : 0,
    from: reference && reference.status !== latest.status ? reference.status : null,
  };
}

/** True when anything worth mentioning moved. */
export function hasMoved(trend: Trend): boolean {
  return trend.delta !== 0 || trend.from !== null;
}

/**
 * The ones that moved, most worth reading first.
 *
 * A promotion outranks a demotion of the same size, because the app exists to
 * catch the moment a name becomes buyable; beyond that it is simply how far it
 * travelled. Losses still appear — a stock quietly shedding conditions is the
 * other thing you would want to be told.
 */
export function movers(trends: Trend[]): Trend[] {
  const direction = (t: Trend) => (t.from ? RANK[t.latest.status] - RANK[t.from] : 0);

  return trends
    .filter(hasMoved)
    .sort((a, b) => {
      const promoted = Math.sign(direction(b)) - Math.sign(direction(a));
      if (promoted !== 0) return promoted;
      const size = Math.abs(b.delta) - Math.abs(a.delta);
      if (size !== 0) return size;
      // Gains before losses at equal size, then alphabetical so the order is
      // stable between renders.
      return b.delta - a.delta || a.symbol.localeCompare(b.symbol);
    });
}

/**
 * The same trend seen over a shorter window.
 *
 * The history is fetched once, over the longest window any part of the page
 * needs, and narrowed here — "what changed this week" and "the last three
 * months" are two readings of one set of rows, not two round trips.
 */
export function within(trend: Trend, days: number, now: Date = new Date()): Trend | null {
  const start = windowStart(days, now);
  return buildTrend(
    trend.symbol,
    trend.points.filter((p) => p.as_of >= start),
  );
}

/** The date a window should reach back to, as the `as_of` strings are stored. */
export function windowStart(days: number, now: Date = new Date()): string {
  const start = new Date(now.getTime() - days * 86_400_000);
  return start.toISOString().slice(0, 10);
}

export interface ConditionState {
  key: string;
  applicable: boolean;
  passed: boolean;
}

export interface ConditionChange {
  key: string;
  /** True when it started passing, false when it stopped. */
  gained: boolean;
}

/**
 * Which named conditions flipped between two evaluations.
 *
 * The count alone says a stock improved; this says what improved, which is the
 * part that tells you whether to care. Conditions that became applicable or
 * stopped being applicable are left out: that is a change in what the rules
 * measure, not a change in the company.
 */
export function conditionChanges(
  before: ConditionState[],
  after: ConditionState[],
): ConditionChange[] {
  const previous = new Map(before.map((c) => [c.key, c]));

  return after
    .filter((now) => {
      const then = previous.get(now.key);
      return then != null && then.applicable && now.applicable && then.passed !== now.passed;
    })
    .map((now) => ({ key: now.key, gained: now.passed }));
}
