/**
 * How old the figures are.
 *
 * The failure this guards against is silence: a nightly job that stops leaves
 * the same "As of <date>" on every page, and nothing anywhere says the numbers
 * have stopped moving. These tests pin the thresholds and the wording, and the
 * clock is injected so "is it stale yet" does not depend on when they run.
 */
import { describe, expect, it } from 'vitest';
import {
  freshnessOf,
  relativeAge,
  STALE_AFTER_HOURS,
  VERY_STALE_AFTER_HOURS,
} from './freshness';

const at = (iso: string) => new Date(iso);
const labels = { justNow: 'just now', hours: '{count}h ago', days: '{count}d ago' };

describe('freshnessOf', () => {
  it('measures the age from the start of the stamped day', () => {
    // Stamped 2026-09-13, read at noon on the 14th: 36 hours.
    const { ageHours } = freshnessOf('2026-09-13', at('2026-09-14T12:00:00Z'));
    expect(ageHours).toBeCloseTo(36, 1);
  });

  it('is fresh inside the threshold', () => {
    const f = freshnessOf('2026-09-13', at('2026-09-14T12:00:00Z'));
    expect(f.isStale).toBe(false);
    expect(f.isVeryStale).toBe(false);
  });

  it('turns stale once a nightly run has been missed', () => {
    const justUnder = freshnessOf('2026-09-13', at('2026-09-14T23:00:00Z'));
    const justOver = freshnessOf('2026-09-13', at('2026-09-15T01:00:00Z'));

    expect(justUnder.ageHours).toBeLessThan(STALE_AFTER_HOURS);
    expect(justUnder.isStale).toBe(false);
    expect(justOver.ageHours).toBeGreaterThan(STALE_AFTER_HOURS);
    expect(justOver.isStale).toBe(true);
  });

  it('escalates after a week, when something is actually broken', () => {
    const stale = freshnessOf('2026-09-13', at('2026-09-17T00:00:00Z'));
    const broken = freshnessOf('2026-09-13', at('2026-09-25T00:00:00Z'));

    expect(stale.isStale).toBe(true);
    expect(stale.isVeryStale).toBe(false);
    expect(broken.ageHours).toBeGreaterThan(VERY_STALE_AFTER_HOURS);
    expect(broken.isVeryStale).toBe(true);
  });

  it('says nothing when nothing has ever been computed', () => {
    for (const value of [null, undefined, '']) {
      const f = freshnessOf(value, at('2026-09-14T12:00:00Z'));
      expect(f.ageHours).toBeNull();
      expect(f.isStale).toBe(false);
    }
  });

  it('ignores an unparseable stamp rather than reporting nonsense', () => {
    expect(freshnessOf('not-a-date', at('2026-09-14T12:00:00Z')).ageHours).toBeNull();
  });

  /** A clock skew should not present itself as freshness news. */
  it('treats a future stamp as brand new, not as negative age', () => {
    const f = freshnessOf('2026-09-20', at('2026-09-14T12:00:00Z'));
    expect(f.ageHours).toBe(0);
    expect(f.isStale).toBe(false);
  });
});

describe('relativeAge', () => {
  it('reads in hours inside a day', () => {
    expect(relativeAge(19, labels)).toBe('19h ago');
    expect(relativeAge(1, labels)).toBe('1h ago');
  });

  it('reads in days beyond one', () => {
    expect(relativeAge(36, labels)).toBe('1d ago');
    expect(relativeAge(24 * 9, labels)).toBe('9d ago');
  });

  it('has a phrase for the first hour', () => {
    expect(relativeAge(0.4, labels)).toBe('just now');
  });

  it('says nothing when there is no age', () => {
    expect(relativeAge(null, labels)).toBeNull();
  });

  /** Rounding down means the figure never flatters itself. */
  it('rounds down, so it never claims to be newer than it is', () => {
    expect(relativeAge(23.9, labels)).toBe('23h ago');
    expect(relativeAge(47.9, labels)).toBe('1d ago');
  });
});
