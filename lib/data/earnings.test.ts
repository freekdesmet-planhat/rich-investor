/**
 * Reading a stored earnings date.
 *
 * The cases that matter are the ones the live data actually produced: three
 * of thirty watchlist snapshots carried a date that had already passed,
 * because the quote provider does not always roll the field forward after a
 * company reports.
 */
import { describe, expect, it } from 'vitest';
import { EARNINGS_SOON_DAYS, reportingSoon, upcomingEarnings } from './earnings';

const TODAY = new Date('2026-09-21T09:00:00Z');

describe('upcomingEarnings', () => {
  it('reads a future date and counts the days to it', () => {
    expect(upcomingEarnings('2026-10-14', TODAY)).toEqual({
      date: '2026-10-14',
      daysAway: 23,
      soon: false,
    });
  });

  it('flags a date inside the window as soon', () => {
    expect(upcomingEarnings('2026-09-30', TODAY)).toMatchObject({ daysAway: 9, soon: true });
    expect(upcomingEarnings('2026-10-05', TODAY)).toMatchObject({
      daysAway: EARNINGS_SOON_DAYS,
      soon: true,
    });
    expect(upcomingEarnings('2026-10-06', TODAY)).toMatchObject({ soon: false });
  });

  it('counts today as zero days away, not as past', () => {
    expect(upcomingEarnings('2026-09-21', TODAY)).toEqual({
      date: '2026-09-21',
      daysAway: 0,
      soon: true,
    });
  });

  /**
   * MC.PA and KER.PA were both carrying July dates in late September. The
   * company had reported; the field had not moved. Printing it would be a
   * confident statement that happens to be false.
   */
  it('treats a date that has already passed as no date', () => {
    expect(upcomingEarnings('2026-07-27', TODAY)).toBeNull();
    expect(upcomingEarnings('2026-09-20', TODAY)).toBeNull();
  });

  it('treats absent or unreadable values as no date', () => {
    for (const bad of [null, undefined, '', 'soon', 'not-a-date']) {
      expect(upcomingEarnings(bad, TODAY)).toBeNull();
    }
  });

  /** The stored values carry a time; the display does not. */
  it('keeps just the date from a timestamp', () => {
    expect(upcomingEarnings('2026-10-14T20:00:00.000Z', TODAY)?.date).toBe('2026-10-14');
  });

  /** A date late in the day must not read as a day nearer than it is. */
  it('does not let the time of day shift the count', () => {
    const lateInTheDay = new Date('2026-09-21T23:30:00Z');
    expect(upcomingEarnings('2026-09-24', lateInTheDay)?.daysAway).toBe(3);
  });
});

describe('reportingSoon', () => {
  const entries = [
    { symbol: 'FAR', nextEarningsDate: '2026-12-01' },
    { symbol: 'SOON', nextEarningsDate: '2026-09-30' },
    { symbol: 'SOONER', nextEarningsDate: '2026-09-23' },
    { symbol: 'STALE', nextEarningsDate: '2026-07-27' },
    { symbol: 'NONE', nextEarningsDate: null },
  ];

  it('keeps only the names reporting inside the window, nearest first', () => {
    expect(reportingSoon(entries, TODAY).map((e) => e.symbol)).toEqual(['SOONER', 'SOON']);
  });

  it('carries the reading through, so the caller need not redo it', () => {
    const [first] = reportingSoon(entries, TODAY);
    expect(first.earnings).toMatchObject({ date: '2026-09-23', daysAway: 2, soon: true });
    expect(first.symbol).toBe('SOONER');
  });

  it('returns nothing when no one is reporting soon', () => {
    expect(reportingSoon([{ symbol: 'FAR', nextEarningsDate: '2026-12-01' }], TODAY)).toEqual([]);
  });
});
