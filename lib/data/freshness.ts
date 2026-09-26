/**
 * How old the figures on screen are.
 *
 * Every page carried "As of 2026-09-13" and nothing else. A date is not an age:
 * it reads the same whether the nightly job ran eight hours ago or stopped a
 * fortnight back, so a job that silently dies is invisible until someone
 * notices the numbers have not moved. The point of this module is that the page
 * can say "19 hours ago" and, past a threshold, say that something is wrong.
 *
 * Pure and clock-injectable, because "is this stale" is a time-dependent claim
 * and a test should not have to wait for tomorrow to check it.
 */

/** Past this, the nightly job has missed at least one run. */
export const STALE_AFTER_HOURS = 48;

/** Past this, it has missed several and something is actually broken. */
export const VERY_STALE_AFTER_HOURS = 24 * 7;

export type Freshness = {
  /** Null when there is no date at all — nothing has ever been computed. */
  ageHours: number | null;
  isStale: boolean;
  isVeryStale: boolean;
};

/**
 * Age of a date-only stamp, in hours.
 *
 * `as_of` is a calendar date, not an instant, so it is read as the start of
 * that day in UTC — the pipeline stamps the day it ran. That makes the age a
 * slight over-estimate within the day, which is the safe direction: it can
 * warn a few hours early, never a day late.
 */
export function freshnessOf(asOf: string | null | undefined, now: Date = new Date()): Freshness {
  if (!asOf) return { ageHours: null, isStale: false, isVeryStale: false };

  const stamped = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(stamped)) return { ageHours: null, isStale: false, isVeryStale: false };

  // A stamp in the future is a clock problem, not freshness; treat it as new.
  const ageHours = Math.max(0, (now.getTime() - stamped) / 3_600_000);

  return {
    ageHours,
    isStale: ageHours > STALE_AFTER_HOURS,
    isVeryStale: ageHours > VERY_STALE_AFTER_HOURS,
  };
}

export interface RelativeAgeLabels {
  justNow: string;
  hours: string;
  days: string;
}

/**
 * "19 hours ago", in the reader's language.
 *
 * Deliberately coarse: below a day in hours, above it in days. A watchlist does
 * not need minutes, and rounding up rather than down keeps the figure from
 * flattering itself.
 */
export function relativeAge(ageHours: number | null, labels: RelativeAgeLabels): string | null {
  if (ageHours == null) return null;
  if (ageHours < 1) return labels.justNow;

  if (ageHours < 24) {
    const hours = Math.floor(ageHours);
    return labels.hours.replace('{count}', String(hours));
  }

  const days = Math.floor(ageHours / 24);
  return labels.days.replace('{count}', String(days));
}

/**
 * Hours since an actual instant, from a timestamp rather than a calendar date.
 *
 * The staleness check above reads `as_of`, a date, because "has the nightly job
 * stopped" is a question about days. This reads `created_at`, the moment the row
 * was written, because "how long ago was this stock analysed" is a question
 * about hours — and a stock analysed on demand two minutes ago must not read
 * "17h ago" because its `as_of` date began at midnight (audit 11).
 */
export function hoursSince(instant: string | null | undefined, now: Date = new Date()): number | null {
  if (!instant) return null;
  const stamped = Date.parse(instant);
  if (Number.isNaN(stamped)) return null;
  return Math.max(0, (now.getTime() - stamped) / 3_600_000);
}
