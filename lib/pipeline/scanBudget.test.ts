/**
 * Dividing the nightly run between the watchlist and the universe scan.
 *
 * The watchlist pass is obligatory and runs first; the scan takes the smaller
 * of what it was asked for and what the clock can still afford. The cases worth
 * pinning are the ones where the arithmetic would otherwise do something
 * quietly wrong: a night with nothing left booking a batch anyway, a mistyped
 * environment value disabling the scan by accident, and a single slow night
 * collapsing every night after it.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MS_PER_CANDIDATE,
  DEFAULT_SCAN_BATCH,
  MAX_SCAN_BATCH,
  observedMsPerCandidate,
  parseOverride,
  RUN_CEILING_MS,
  SAFETY_MARGIN_MS,
  scanBudget,
} from './scanBudget';

describe('scanBudget', () => {
  it('scans the default batch when the night can afford it', () => {
    // 60s ceiling, 5s spent, 10s margin -> 45s, and at the measured 500ms a
    // candidate that is ninety of them, so the default batch is the binding
    // number rather than the clock.
    const budget = scanBudget({ elapsedMs: 5_000, msPerCandidate: 500 });

    expect(budget.remainingMs).toBe(RUN_CEILING_MS - 5_000 - SAFETY_MARGIN_MS);
    expect(budget.limit).toBe(DEFAULT_SCAN_BATCH);
    expect(budget.reason).toBe('default');
  });

  /**
   * The clock wins whenever it is the smaller number, which against a 60s
   * ceiling and a pessimistic 3s per candidate is very nearly always. The
   * measured cost from a real night is what lifts it.
   */
  it('falls back to what the clock allows when that is less', () => {
    const budget = scanBudget({ elapsedMs: 30_000 });

    expect(budget.limit).toBe(Math.floor(budget.remainingMs / DEFAULT_MS_PER_CANDIDATE));
    expect(budget.limit).toBeLessThan(DEFAULT_SCAN_BATCH);
    expect(budget.reason).toBe('time');
  });

  it('shrinks the batch when the watchlist ran long', () => {
    const quick = scanBudget({ elapsedMs: 5_000 });
    const slow = scanBudget({ elapsedMs: 35_000 });

    expect(slow.limit).toBeLessThan(quick.limit);
    expect(slow.limit).toBeGreaterThan(0);
  });

  /**
   * The whole point of the table this feeds: a batch of zero must never be a
   * number nobody can account for.
   */
  it('always explains itself, whatever the batch came out at', () => {
    for (const input of [
      { elapsedMs: 5_000 },
      { elapsedMs: 5_000, override: '5' },
      { elapsedMs: 5_000, override: 'sixty' },
      { elapsedMs: 5_000, override: '0' },
      { elapsedMs: RUN_CEILING_MS },
    ]) {
      const budget = scanBudget(input);
      expect(budget.notes.length).toBeGreaterThan(0);
      for (const note of budget.notes) expect(note.trim().length).toBeGreaterThan(0);
    }
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
    // A long watchlist, so the clock is what binds and the cost per candidate
    // is what decides how many fit into what is left.
    const guessed = scanBudget({ elapsedMs: 30_000 });
    const measured = scanBudget({ elapsedMs: 30_000, msPerCandidate: 1_000 });

    expect(measured.msPerCandidate).toBe(1_000);
    expect(measured.limit).toBeGreaterThan(guessed.limit);
  });

  it('ignores a nonsensical measurement', () => {
    for (const bad of [0, -5, null]) {
      expect(scanBudget({ elapsedMs: 5_000, msPerCandidate: bad }).msPerCandidate).toBe(
        DEFAULT_MS_PER_CANDIDATE,
      );
    }
  });

  it('never exceeds the ceiling on a very fast night', () => {
    const budget = scanBudget({ elapsedMs: 0, msPerCandidate: 1, override: '999999' });
    expect(budget.limit).toBe(MAX_SCAN_BATCH);
  });

  describe('an explicit SCAN_BATCH_SIZE', () => {
    it('wins over the arithmetic', () => {
      const budget = scanBudget({ elapsedMs: 30_000, override: '5' });
      expect(budget.limit).toBe(5);
      expect(budget.reason).toBe('override');
    });

    /** An instruction, but not one that can book time the run does not have. */
    it('still cannot outrun the clock', () => {
      const budget = scanBudget({ elapsedMs: 55_000, override: '200' });
      expect(budget.limit).toBe(0);
    });

    it('can switch the scan off, and says that it was asked to', () => {
      const budget = scanBudget({ elapsedMs: 0, override: '0' });

      expect(budget.limit).toBe(0);
      expect(budget.reason).toBe('disabled');
      expect(budget.notes.join(' ')).toContain('switched off by configuration');
    });

    /**
     * The failure this whole change is about: `SCAN_BATCH_SIZE=sixty` used to
     * parse as unset, fall through, and leave the scan doing nothing with
     * nothing said about it.
     */
    it('falls back to the default rather than to nothing when it is unreadable', () => {
      const budget = scanBudget({ elapsedMs: 5_000, msPerCandidate: 500, override: 'sixty' });

      expect(budget.limit).toBe(DEFAULT_SCAN_BATCH);
      expect(budget.reason).toBe('invalid_override');
      expect(budget.notes.join(' ')).toContain('not a whole number');
    });

    it('falls back to the default when nothing is configured', () => {
      const budget = scanBudget({ elapsedMs: 5_000, msPerCandidate: 500, override: null });

      expect(budget.limit).toBe(DEFAULT_SCAN_BATCH);
      expect(budget.reason).toBe('default');
      expect(budget.notes.join(' ')).toContain('unset');
    });
  });
});

describe('parseOverride', () => {
  it('reads a whole number', () => {
    expect(parseOverride('45')).toMatchObject({ value: 45, kind: 'set' });
    expect(parseOverride(' 12 ')).toMatchObject({ value: 12, kind: 'set' });
  });

  /** Zero is an instruction, not an absence, and is named as one. */
  it('separates a deliberate zero from an absent value', () => {
    expect(parseOverride('0')).toMatchObject({ value: 0, kind: 'disabled' });
    expect(parseOverride(null)).toMatchObject({ value: null, kind: 'unset' });
  });

  it('tells an unreadable value apart from an unset one', () => {
    for (const raw of ['sixty', 'NaN', '12abc', '-10', '12.5']) {
      expect(parseOverride(raw)).toMatchObject({ value: null, kind: 'invalid' });
    }
    for (const raw of ['', '  ', null, undefined]) {
      expect(parseOverride(raw)).toMatchObject({ value: null, kind: 'unset' });
    }
  });

  it('caps a value that would run away', () => {
    expect(parseOverride('999999')).toMatchObject({ value: MAX_SCAN_BATCH, kind: 'set' });
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
