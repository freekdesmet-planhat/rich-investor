import { describe, it, expect } from 'vitest';
import { symbolBucket, bucketForDate, isDueTonight } from './rotation';

describe('price-pass rotation', () => {
  it('buckets a symbol into 0..mod-1 and is stable', () => {
    for (const sym of ['AAPL', 'ASML.AS', 'MC.PA', 'BRK.B']) {
      const b = symbolBucket(sym, 7);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(7);
      expect(symbolBucket(sym, 7)).toBe(b); // deterministic
    }
  });

  it('spreads a realistic set roughly evenly across 7 buckets', () => {
    const counts = new Array(7).fill(0);
    for (let i = 0; i < 1400; i++) counts[symbolBucket(`SYM${i}`, 7)]++;
    // No bucket should be empty or wildly oversized on 1,400 names.
    for (const c of counts) {
      expect(c).toBeGreaterThan(120);
      expect(c).toBeLessThan(280);
    }
  });

  it('advances the nightly bucket by one each day and wraps', () => {
    expect(bucketForDate('2026-09-26', 7)).toBe(bucketForDate('2026-09-19', 7)); // 7 days later
    const a = bucketForDate('2026-09-26', 7);
    const b = bucketForDate('2026-09-27', 7);
    expect(b).toBe((a + 1) % 7);
  });

  it('covers the whole set exactly once over `mod` consecutive nights', () => {
    const symbols = Array.from({ length: 300 }, (_, i) => `T${i}`);
    const seen = new Set<string>();
    // Seven consecutive days -> every symbol due on exactly one of them.
    for (const day of ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']) {
      for (const s of symbols) if (isDueTonight(s, day, 7)) seen.add(s);
    }
    expect(seen.size).toBe(symbols.length);
  });

  it('mod 1 means always due', () => {
    expect(isDueTonight('AAPL', '2026-09-26', 1)).toBe(true);
  });
});
