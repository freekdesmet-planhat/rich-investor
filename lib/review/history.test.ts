/**
 * What the history is for: seeing that you changed your mind.
 *
 * The cases worth pinning are the ones where a naive "list the saves" display
 * would mislead — the first entry, which is a statement rather than a change,
 * and a re-save that moved nothing, which should not read as a new verdict.
 */
import { describe, expect, it } from 'vitest';
import { summariseHistory, type HistoryEntry } from './history';

const entry = (over: Partial<HistoryEntry> & { id: string; saved_at: string }): HistoryEntry => ({
  assessment: 'not_assessed',
  catalysts: [],
  sell_signals: [],
  marks_answer: null,
  ...over,
});

describe('summariseHistory', () => {
  it('treats the oldest entry as a first statement, not a change', () => {
    const [first] = summariseHistory([
      entry({ id: 'a', saved_at: '2026-03-01T10:00:00Z', assessment: 'temporary', catalysts: ['buybacks'] }),
    ]);

    expect(first.isFirst).toBe(true);
    expect(first.changedFrom).toBeNull();
    // Its catalysts are listed, but as what was recorded — not as additions to
    // something earlier, because there is nothing earlier.
    expect(first.addedCatalysts).toEqual(['buybacks']);
    expect(first.removedCatalysts).toEqual([]);
  });

  it('names the verdict a save replaced', () => {
    const [newest] = summariseHistory([
      entry({ id: 'b', saved_at: '2026-06-01T10:00:00Z', assessment: 'structural' }),
      entry({ id: 'a', saved_at: '2026-03-01T10:00:00Z', assessment: 'temporary' }),
    ]);

    expect(newest.changedFrom).toBe('temporary');
    expect(newest.entry.assessment).toBe('structural');
    expect(newest.unchanged).toBe(false);
  });

  it('says nothing changed when the verdict held', () => {
    const [newest] = summariseHistory([
      entry({ id: 'b', saved_at: '2026-06-01T10:00:00Z', assessment: 'temporary', catalysts: ['buybacks'] }),
      entry({ id: 'a', saved_at: '2026-03-01T10:00:00Z', assessment: 'temporary', catalysts: ['buybacks'] }),
    ]);

    expect(newest.changedFrom).toBeNull();
    expect(newest.unchanged).toBe(true);
  });

  it('reports both what you started and stopped ticking', () => {
    const [newest] = summariseHistory([
      entry({
        id: 'b',
        saved_at: '2026-06-01T10:00:00Z',
        catalysts: ['buybacks', 'dividend_increase'],
        sell_signals: ['declining_solvency'],
      }),
      entry({
        id: 'a',
        saved_at: '2026-03-01T10:00:00Z',
        catalysts: ['buybacks', 'sector_still_growing'],
        sell_signals: [],
      }),
    ]);

    expect(newest.addedCatalysts).toEqual(['dividend_increase']);
    expect(newest.removedCatalysts).toEqual(['sector_still_growing']);
    expect(newest.addedSellSignals).toEqual(['declining_solvency']);
    expect(newest.removedSellSignals).toEqual([]);
    expect(newest.unchanged).toBe(false);
  });

  it('notices the answer to Marks’ question being rewritten', () => {
    const [newest] = summariseHistory([
      entry({ id: 'b', saved_at: '2026-06-01T10:00:00Z', marks_answer: 'Fewer.' }),
      entry({ id: 'a', saved_at: '2026-03-01T10:00:00Z', marks_answer: 'More.' }),
    ]);

    expect(newest.marksChanged).toBe(true);
    expect(newest.unchanged).toBe(false);
  });

  /** Empty and null are the same absence; one must not read as an edit. */
  it('does not call an empty answer a change from no answer', () => {
    const [newest] = summariseHistory([
      entry({ id: 'b', saved_at: '2026-06-01T10:00:00Z', marks_answer: '' }),
      entry({ id: 'a', saved_at: '2026-03-01T10:00:00Z', marks_answer: null }),
    ]);

    expect(newest.marksChanged).toBe(false);
    expect(newest.unchanged).toBe(true);
  });

  it('keeps the log in the order it was given', () => {
    const changes = summariseHistory([
      entry({ id: 'c', saved_at: '2026-09-01T10:00:00Z' }),
      entry({ id: 'b', saved_at: '2026-06-01T10:00:00Z' }),
      entry({ id: 'a', saved_at: '2026-03-01T10:00:00Z' }),
    ]);

    expect(changes.map((c) => c.entry.id)).toEqual(['c', 'b', 'a']);
    expect(changes.map((c) => c.isFirst)).toEqual([false, false, true]);
  });

  it('has nothing to say about an empty log', () => {
    expect(summariseHistory([])).toEqual([]);
  });
});
