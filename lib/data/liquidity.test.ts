/**
 * Reading a quote for liquidity.
 *
 * Every case here is a real observation from the provider, taken at 07:49
 * UTC on 2026-09-21, not an invented edge case. That matters because the
 * whole point of this module is that the obvious implementation — divide ask
 * minus bid by the mid — produces confident nonsense most of the time.
 */
import { describe, expect, it } from 'vitest';
import { readLiquidity, THIN_TURNOVER_USD } from './liquidity';

const base = {
  price: 336.13,
  currency: 'USD',
  bid: null,
  ask: null,
  averageDailyVolume: 53_449_420,
  marketState: 'REGULAR',
};

describe('readLiquidity', () => {
  it('reports average volume and turnover', () => {
    const l = readLiquidity(base);

    expect(l.averageDailyVolume).toBe(53_449_420);
    expect(l.turnover).toBeCloseTo(336.13 * 53_449_420, 0);
    expect(l.currency).toBe('USD');
    expect(l.thin).toBe(false);
  });

  it('computes a spread when the market is open and both sides are quoted', () => {
    const l = readLiquidity({ ...base, bid: 336.12, ask: 336.14 });

    expect(l.spreadPercent).toBeCloseTo(0.00595, 4);
    expect(l.spreadUnavailable).toBeNull();
  });

  /**
   * Apple at 07:49 UTC, market in PREPRE: bid 330.31, ask 337.05. A 2.02%
   * spread on a stock whose real spread is a fraction of a basis point. A
   * nightly job at 02:00 UTC would capture only this.
   */
  it('refuses a spread when the market is closed', () => {
    const l = readLiquidity({ ...base, bid: 330.31, ask: 337.05, marketState: 'PREPRE' });

    expect(l.spreadPercent).toBeNull();
    expect(l.spreadUnavailable).toBe('market_closed');
    // The half of the feature that still works does still work.
    expect(l.turnover).toBeGreaterThan(0);
  });

  /** ADYEN.AS and MC.PA, both REGULAR, both quoting zeros. */
  it('refuses a spread for a listing that is not quoted at all', () => {
    const l = readLiquidity({
      ...base,
      price: 878.3,
      currency: 'EUR',
      bid: 0,
      ask: 0,
      averageDailyVolume: 132_889,
    });

    expect(l.spreadPercent).toBeNull();
    expect(l.spreadUnavailable).toBe('not_quoted');
    expect(l.turnover).toBeCloseTo(878.3 * 132_889, 0);
  });

  /**
   * ASML in PREPRE showed 9.44%. Even if a market says it is open, a spread
   * that wide on a mega-cap is a bad datum, not a finding.
   */
  it('discards an implausible spread even with the market open', () => {
    const l = readLiquidity({ ...base, price: 1679.92, bid: 1720.87, ask: 1891.42 });

    expect(l.spreadPercent).toBeNull();
    expect(l.spreadUnavailable).toBe('implausible');
  });

  it('discards a crossed book', () => {
    expect(readLiquidity({ ...base, bid: 337, ask: 336 }).spreadUnavailable).toBe('implausible');
  });

  it('flags thin turnover without attaching a verdict to it', () => {
    const thin = readLiquidity({ ...base, price: 10, averageDailyVolume: 100_000 });

    expect(thin.turnover).toBe(1_000_000);
    expect(thin.thin).toBe(true);
    expect(THIN_TURNOVER_USD).toBe(5_000_000);
  });

  it('says nothing rather than guessing when the quote is empty', () => {
    const l = readLiquidity({
      price: null,
      currency: null,
      bid: null,
      ask: null,
      averageDailyVolume: null,
      marketState: null,
    });

    expect(l).toMatchObject({ turnover: null, averageDailyVolume: null, spreadPercent: null, thin: false });
  });
});
