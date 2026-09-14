/**
 * Reading a review's history as a sequence of changes of mind.
 *
 * `qualitative_reviews` is upserted, so the current row is all there ever was:
 * deciding in March that a problem was temporary and concluding in June that it
 * was structural left no trace of March. `qualitative_review_history` keeps
 * every save, but a bare list of saves is not much better — what you want to
 * see is the moment the verdict turned, and which signal you had started
 * worrying about.
 *
 * So this turns the log into diffs. Pure, because the interesting cases are
 * "nothing changed", "first entry" and "assessment flipped", and none of those
 * should need a database to test.
 */
import type { Assessment } from './keys';

export interface HistoryEntry {
  id: string;
  assessment: Assessment;
  catalysts: string[];
  sell_signals: string[];
  marks_answer: string | null;
  saved_at: string;
}

export interface HistoryChange {
  entry: HistoryEntry;
  /** The verdict this save replaced, and only when it actually replaced one. */
  changedFrom: Assessment | null;
  addedCatalysts: string[];
  removedCatalysts: string[];
  addedSellSignals: string[];
  removedSellSignals: string[];
  /** The answer to Marks' question, when this save is where it changed. */
  marksChanged: boolean;
  /** A re-save that moved nothing. Worth showing, not worth spelling out. */
  unchanged: boolean;
  /** The oldest entry: everything on it is a first statement, not a change. */
  isFirst: boolean;
}

const added = (now: string[], before: string[]) => now.filter((k) => !before.includes(k));

/**
 * Annotates each save with what it changed about the one before it.
 *
 * Takes the log newest-first, the order it is read in and displayed in, and
 * compares each entry against its successor in the array — which is the entry
 * that preceded it in time.
 */
export function summariseHistory(entries: HistoryEntry[]): HistoryChange[] {
  return entries.map((entry, i) => {
    const previous = entries[i + 1];

    if (!previous) {
      return {
        entry,
        changedFrom: null,
        addedCatalysts: entry.catalysts,
        removedCatalysts: [],
        addedSellSignals: entry.sell_signals,
        removedSellSignals: [],
        marksChanged: entry.marks_answer != null && entry.marks_answer !== '',
        unchanged: false,
        isFirst: true,
      };
    }

    const changedFrom = entry.assessment === previous.assessment ? null : previous.assessment;
    const addedCatalysts = added(entry.catalysts, previous.catalysts);
    const removedCatalysts = added(previous.catalysts, entry.catalysts);
    const addedSellSignals = added(entry.sell_signals, previous.sell_signals);
    const removedSellSignals = added(previous.sell_signals, entry.sell_signals);
    const marksChanged = (entry.marks_answer ?? '') !== (previous.marks_answer ?? '');

    return {
      entry,
      changedFrom,
      addedCatalysts,
      removedCatalysts,
      addedSellSignals,
      removedSellSignals,
      marksChanged,
      unchanged:
        changedFrom === null &&
        !marksChanged &&
        addedCatalysts.length === 0 &&
        removedCatalysts.length === 0 &&
        addedSellSignals.length === 0 &&
        removedSellSignals.length === 0,
      isFirst: false,
    };
  });
}
