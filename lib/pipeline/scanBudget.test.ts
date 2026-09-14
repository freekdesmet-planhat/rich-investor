/**
 * Dividing the nightly run between the watchlist and the universe scan.
 *
 * The watchlist pass is obligatory and runs first; the scan gets the remainder.
 * The cases worth pinning are the ones where the arithmetic would otherwise do
 * something quietly wrong: a night with nothing left booking a batch anyway, a
 * mistyped environment value becoming NaN, and a single slow night collapsing
 * every night after it.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MS_PER_CANDIDATE,
  MAX_SCAN_BATCH,
  observedMsPerCandidate,
  parseOverride,
  RUN_CEILING_MS,
  SAFETY_MARGIN_MS,
  scanBudget,
} from './scanBudget';

describe('scanBudget', () => {
  it('gives the scan what the watchlist left, in whole candidates', () => {
    // 300s ceiling, 60s watchlist, 30s margin -> 210s at 3s each.
    const budget = scanBudget({ elapsedMs: 60_000 });

    expect(budget.remainingMs).toBe(RUN_CEILING_MS - 60_000 - SAFETY_MARGIN_MS);
    expect(budget.limit).toBe(Math.floor(budget.remainingMs / DEFAULT_MS_PER_CANDIDATE));
    expect(budget.reason).toBe('time');
  });

  it('shrinks the batch when the watchlist ran long', () => {
    const quick = scanBudget({ elapsedMs: 30_000 });
    const slow = scanBudget({ elapsedMs: 200_000 });

    expect(slow.limit).toBeLessThan(quick.limit);
    expect(slow.limit).toBeGreaterThan(0);
  });

  /** A watchlist that needs the whole run is not an error; the scan waits. */
  it('skips the scan entirely when nothing is left', () => {
    const budget = scanBudget({ elapsedMs: RUN_CEILING_MS });

    expect(budget.limit).toBe(0);
    expect(budget.reason).toBe('exhausted');
    expect(budget.remainingMs).toBe(0);
  });

  it('keeps a margin back to save the cursor and answer', () => {
    // Everything but the margin spent: nothing affordable, and nothing negative.
    const budget = scanBudget({ elapsedMs: RUN_CEILING_MS - SAFETY_MARGIN_MS });
    expect(budget.limit).toBe(0);
  });

  it('uses a measured cost in place of the guess', () => {
    const guessed = scanBudget({ elapsedMs: 60_000 });
    const measured = scanBudget({ elapsedMs: 60_000, msPerCandidate: 1_000 });

    expect(measured.msPerCandidate).toBe(1_000);
    expect(measured.limit).toBeGreaterThan(guessed.limit);
  });

  it('ignores a nonsensical measurement', () => {
    for (const bad of [0, -5, null]) {
      expect(scanBudget({ elapsedMs: 60_000, msPerCandidate: bad }).msPerCandidate).toBe(
        DEFAULT_MS_PER_CANDIDATE,
      );
    }
  });

  it('never exceeds the ceiling on a very fast night', () => {
    const budget = scanBudget({ elapsedMs: 0, msPerCandidate: 1 });
    expect(budget.limit).toBe(MAX_SCAN_BATCH);
  });

  describe('an explicit SCAN_BATCH_SIZE', () => {
    it('wins over the arithmetic', () => {
      const budget = scanBudget({ elapsedMs: 60_000, override: '5' });
      expect(budget.limit).toBe(5);
      expect(budget.reason).toBe('override');
    });

    /** An instruction, but not one that can book time the run does not have. */
    it('still cannot outrun the clock', () => {
      const budget = scanBudget({ elapsedMs: 280_000, override: '200' });
      expect(budget.limit).toBe(0);
    });

    it('can switch the scan off', () => {
      expect(scanBudget({ elapsedMs: 0, override: '0' }).limit).toBe(0);
    });
  });
});

describe('parseOverride', () => {
  it('reads a whole number', () => {
    expect(parseOverride('45')).toBe(45);
    expect(parseOverride(' 12 ')).toBe(12);
    expect(parseOverride('0')).toBe(0);
  });

  it('treats an unreadable value as unset rather than as zero', () => {
    for (const raw of ['sixty', '', '  ', 'NaN', '12abc', null, undefined]) {
      expect(parseOverride(raw)).toBeNull();
    }
  });

  it('refuses a negative or fractional batch', () => {
    expect(parseOverride('-10')).toBeNull();
    expect(parseOverride('12.5')).toBeNull();
  });

  it('caps a value that would run away', () => {
    expect(parseOverride('999999')).toBe(MAX_SCAN_BATCH);
  });
});

describe('observedMsPerCandidate', () => {
  it('measures what a candidate actually cost', () => {
    expect(observedMsPerCandidate(60_000, 30)).toBe(2_000);
  });

  /** One bad hour at a provider should not collapse every night after it. */
  it('smooths against the previous figure', () => {
    expect(observedMsPerCandidate(60_000, 30, 1_000)).toBe(1_500);
    expect(observedMsPerCandidate(20_000, 10, 4_000)).toBe(3_000);
  });

  it('has nothing to report from a scan that evaluated nothing', () => {
    expect(observedMsPerCandidate(5_000, 0)).toBeNull();
    expect(observedMsPerCandidate(0, 10)).toBeNull();
    expect(observedMsPerCandidate(Number.NaN, 10)).toBeNull();
  });
});
