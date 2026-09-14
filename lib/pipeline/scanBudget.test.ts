/**
 * The nightly scan's size, which is read from the environment.
 *
 * The cases worth pinning are the ones where coercion would do something
 * quietly wrong: a mistyped value becoming NaN and scanning nothing, or a
 * fat-fingered extra zero pointing the run at thousands of tickers and
 * exhausting a provider the watchlist pass still needs.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCAN_BATCH, MAX_SCAN_BATCH, scanBatchSize } from './scanBudget';

describe('scanBatchSize', () => {
  it('leaves room for manual additions by default', () => {
    expect(scanBatchSize(undefined)).toBe(30);
    expect(DEFAULT_SCAN_BATCH).toBe(30);
  });

  it('honours an explicit setting', () => {
    expect(scanBatchSize('45')).toBe(45);
    expect(scanBatchSize(' 12 ')).toBe(12);
  });

  /** Zero is a real answer: leave tonight's whole budget to everything else. */
  it('allows the scan to be switched off', () => {
    expect(scanBatchSize('0')).toBe(0);
  });

  it('treats an unreadable value as unset rather than as zero', () => {
    for (const raw of ['sixty', '', '   ', 'NaN', '12abc']) {
      expect(scanBatchSize(raw)).toBe(DEFAULT_SCAN_BATCH);
    }
  });

  it('refuses a negative or fractional batch', () => {
    expect(scanBatchSize('-10')).toBe(DEFAULT_SCAN_BATCH);
    expect(scanBatchSize('12.5')).toBe(DEFAULT_SCAN_BATCH);
  });

  /** An extra zero must not become a night that exhausts a provider. */
  it('caps a value that would run away', () => {
    expect(scanBatchSize('600')).toBe(MAX_SCAN_BATCH);
    expect(scanBatchSize('999999')).toBe(MAX_SCAN_BATCH);
  });
});
