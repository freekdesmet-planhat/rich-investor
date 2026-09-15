/**
 * Where the universe scan got to, and what a candidate cost it.
 *
 * Both live in `macro_context.detail`, beside the day they were written. That
 * is a reasonable home — the nightly job owns that row — but it made the read
 * subtly wrong, and the symptom was invisible.
 *
 * The scan used to read "the most recent macro_context row". The nightly run
 * refreshes the macro context *before* it scans, and that refresh inserts the
 * day's row with `detail` defaulting to `{}`. So by the time the scan asked
 * where it had got to, the newest row was today's — empty — and the answer was
 * always zero. Every night re-walked the same first few hundred candidates and
 * the rest of the screened universe was never reached at all. Nothing failed;
 * the suggestion feed just kept drawing from the same corner.
 *
 * So the state is the most recent value that *exists*, not whatever the newest
 * row happens to hold. Cursor and cost are searched for independently, because
 * a night that wrote one and not the other should not hide the other.
 */

export const CURSOR_KEY = 'scan_cursor';
export const COST_KEY = 'scanMsPerCandidate';

export interface ScanState {
  cursor: number;
  /** Null until some night has measured one. */
  msPerCandidate: number | null;
}

export interface DetailRow {
  detail: Record<string, unknown> | null;
}

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

const nonNegativeNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/**
 * Reads the state out of recent rows, newest first.
 *
 * Takes rows rather than a client so the walk can be tested without a database,
 * which is the part that was wrong.
 */
export function readScanStateFrom(rows: DetailRow[]): ScanState {
  let cursor: number | null = null;
  let msPerCandidate: number | null = null;

  for (const row of rows) {
    const detail = row.detail ?? {};
    if (cursor == null) cursor = nonNegativeNumber(detail[CURSOR_KEY]);
    if (msPerCandidate == null) msPerCandidate = positiveNumber(detail[COST_KEY]);
    if (cursor != null && msPerCandidate != null) break;
  }

  return { cursor: cursor ?? 0, msPerCandidate };
}

/**
 * The `detail` to write back, merged onto whatever the day's row already holds.
 *
 * Merged rather than replaced: the previous version wrote `{ cursor }` over the
 * whole of `detail`, which was harmless while the cursor was the only key in it
 * and silently dropped anything added later.
 */
export function mergeScanState(
  existing: Record<string, unknown> | null,
  state: ScanState,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    [CURSOR_KEY]: state.cursor,
    ...(state.msPerCandidate != null ? { [COST_KEY]: state.msPerCandidate } : {}),
  };
}
