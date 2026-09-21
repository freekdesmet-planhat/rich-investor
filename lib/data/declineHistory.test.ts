import { describe, expect, it } from 'vitest';
import { declineContext, MARKET_DECLINES } from './declineHistory';

describe('declineContext', () => {
  it('calls a fall under 20% shallow, below anything in the table', () => {
    expect(declineContext(-0.156)).toMatchObject({ severity: 'shallow', declinePercent: 15.6 });
  });

  it('calls 20% to 50% meaningful, the range most of the seventeen sit in', () => {
    expect(declineContext(-0.2)?.severity).toBe('meaningful');
    expect(declineContext(-0.499)?.severity).toBe('meaningful');
  });

  it('calls 50% and worse deep, which only two of the seventeen reached', () => {
    expect(declineContext(-0.5)?.severity).toBe('deep');
    expect(declineContext(-0.65)?.severity).toBe('deep');
  });

  /**
   * The figure the copy quotes is computed from the table, so a correction
   * to the data cannot leave a stale number in a sentence.
   */
  it('counts how many recorded declines were deeper than this one', () => {
    // 1929 at -79% and 2000–09 at -54% are both deeper than a 52% fall.
    expect(declineContext(-0.52)?.deeperInHistory).toBe(2);
    // Only 1929 is deeper than a 60% fall.
    expect(declineContext(-0.6)?.deeperInHistory).toBe(1);
    // Nothing in the table is deeper than an 85% fall.
    expect(declineContext(-0.85)?.deeperInHistory).toBe(0);
  });

  it('carries the recovery range through', () => {
    expect(declineContext(-0.3)).toMatchObject({
      fastestRecoveryMonths: 20,
      slowestRecoveryYears: 13,
      totalDeclines: 17,
    });
  });

  it('says nothing for a stock that has not fallen', () => {
    for (const value of [null, undefined, 0, 0.1, Number.NaN]) {
      expect(declineContext(value)).toBeNull();
    }
  });
});

describe('MARKET_DECLINES', () => {
  /**
   * The headline claim — two of seventeen — has to stay true of the data,
   * not just of the sentence quoting it.
   */
  it('records exactly the two declines that went past 50%', () => {
    expect(MARKET_DECLINES.past50).toHaveLength(2);
    expect(MARKET_DECLINES.past50.every((d) => d.depthPercent > 50)).toBe(true);
    expect(MARKET_DECLINES.past50.map((d) => d.label)).toEqual(['1929', '2000–09']);
  });

  it('has fewer 50%+ declines than declines overall', () => {
    expect(MARKET_DECLINES.past50.length).toBeLessThan(MARKET_DECLINES.total);
  });
});
