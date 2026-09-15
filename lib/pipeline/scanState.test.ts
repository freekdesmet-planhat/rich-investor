/**
 * Remembering where the universe scan got to.
 *
 * The regression this exists for: the nightly run writes the day's macro row
 * before it scans, so the newest row is a fresh one with an empty `detail`.
 * Reading "the newest row" therefore returned no cursor, every night, and the
 * scan silently restarted from the beginning of the universe each time.
 */
import { describe, expect, it } from 'vitest';
import { COST_KEY, CURSOR_KEY, mergeScanState, readScanStateFrom } from './scanState';

const row = (detail: Record<string, unknown> | null) => ({ detail });

describe('readScanStateFrom', () => {
  it('reads the cursor from the newest row that has one', () => {
    const state = readScanStateFrom([row({ [CURSOR_KEY]: 900 }), row({ [CURSOR_KEY]: 450 })]);
    expect(state.cursor).toBe(900);
  });

  /**
   * The bug, in one case: today's row exists and is empty, because the macro
   * refresh created it minutes earlier. The answer is yesterday's cursor, not
   * zero.
   */
  it('looks past an empty row created earlier in the same run', () => {
    const state = readScanStateFrom([row({}), row({ [CURSOR_KEY]: 451 })]);
    expect(state.cursor).toBe(451);
  });

  it('looks past a null detail just the same', () => {
    expect(readScanStateFrom([row(null), row({ [CURSOR_KEY]: 12 })]).cursor).toBe(12);
  });

  it('keeps looking back through several empty days', () => {
    const rows = [row({}), row({}), row({}), row({ [CURSOR_KEY]: 3_000 })];
    expect(readScanStateFrom(rows).cursor).toBe(3_000);
  });

  it('starts at zero only when nothing has ever been written', () => {
    expect(readScanStateFrom([row({}), row(null)]).cursor).toBe(0);
    expect(readScanStateFrom([]).cursor).toBe(0);
  });

  /** Zero is a real cursor — the start of the universe — not a missing one. */
  it('treats a stored zero as an answer', () => {
    expect(readScanStateFrom([row({ [CURSOR_KEY]: 0 }), row({ [CURSOR_KEY]: 500 })]).cursor).toBe(0);
  });

  it('ignores a cursor that is not a usable number', () => {
    for (const bad of ['450', null, -1, Number.NaN, {}]) {
      expect(readScanStateFrom([row({ [CURSOR_KEY]: bad }), row({ [CURSOR_KEY]: 7 })]).cursor).toBe(7);
    }
  });

  it('finds the cost independently of the cursor', () => {
    const rows = [row({ [CURSOR_KEY]: 900 }), row({ [COST_KEY]: 2_034 })];
    expect(readScanStateFrom(rows)).toEqual({ cursor: 900, msPerCandidate: 2_034 });
  });

  it('has no cost to report until one was measured', () => {
    expect(readScanStateFrom([row({ [CURSOR_KEY]: 10 })]).msPerCandidate).toBeNull();
  });

  it('ignores a nonsensical cost', () => {
    for (const bad of [0, -1, '2000']) {
      expect(readScanStateFrom([row({ [COST_KEY]: bad })]).msPerCandidate).toBeNull();
    }
  });
});

describe('mergeScanState', () => {
  it('keeps whatever else the row was holding', () => {
    const merged = mergeScanState({ somethingElse: true }, { cursor: 12, msPerCandidate: 2_000 });
    expect(merged).toEqual({ somethingElse: true, [CURSOR_KEY]: 12, [COST_KEY]: 2_000 });
  });

  it('writes the cursor even when there is no cost yet', () => {
    expect(mergeScanState(null, { cursor: 5, msPerCandidate: null })).toEqual({ [CURSOR_KEY]: 5 });
  });

  it('does not erase a known cost with a null one', () => {
    const merged = mergeScanState({ [COST_KEY]: 1_900 }, { cursor: 5, msPerCandidate: null });
    expect(merged[COST_KEY]).toBe(1_900);
  });
});
