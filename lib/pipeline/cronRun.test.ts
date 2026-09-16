/**
 * What a night's record has to be able to say.
 *
 * Every case here is one of the three nights that went by unnoticed: a scan
 * that was switched off, a scan that threw, and a scan that ran and found
 * nothing. They were indistinguishable from the outside, and the only thing
 * that makes them distinguishable now is this row — so the assertions are about
 * whether the row can still tell them apart.
 */
import { describe, expect, it, vi } from 'vitest';
import { CronRunRecorder, deriveStatus, type StageRecord } from './cronRun';

const stage = (over: Partial<StageRecord> = {}): StageRecord => ({ ok: true, durationMs: 1, ...over });

describe('deriveStatus', () => {
  it('is ok only when every stage both ran and succeeded', () => {
    expect(deriveStatus({ watchlist: stage(), scan: stage() })).toBe('ok');
  });

  it('is failed when the obligatory stage failed', () => {
    expect(deriveStatus({ watchlist: stage({ ok: false, error: 'boom' }) })).toBe('failed');
    expect(
      deriveStatus({ watchlist: stage({ ok: false, error: 'boom' }), scan: stage() }),
    ).toBe('failed');
  });

  it('is partial when the scan failed but the watchlist did not', () => {
    expect(deriveStatus({ watchlist: stage(), scan: stage({ ok: false, error: 'boom' }) })).toBe(
      'partial',
    );
  });

  /**
   * A skip is not an error, and it is not "ok" either. Folding it into ok would
   * rebuild the exact blind spot this table exists to remove: three nights of
   * `SCAN_BATCH_SIZE` quietly resolving to zero, every one of them reported as
   * a clean run.
   */
  it('is partial when a stage was skipped rather than failed', () => {
    const stages = { watchlist: stage(), scan: stage({ skippedReason: 'disabled' }) };

    expect(deriveStatus(stages)).toBe('partial');
    expect(stages.scan.ok).toBe(true);
  });

  it('is failed when nothing ran at all', () => {
    expect(deriveStatus({})).toBe('failed');
  });
});

describe('CronRunRecorder', () => {
  const at = (iso: string) => new Date(iso);

  it('records a clean night with its counts and duration', () => {
    const run = new CronRunRecorder('nightly-scan', at('2026-09-17T02:00:00Z'));
    run.log('fetching 32 tickers');
    run.succeeded('watchlist', 61_000, { count: 32 });
    run.succeeded('scan', 120_000, { count: 60 });
    run.record({
      watchlistEvaluated: 32,
      scanEvaluated: 60,
      scanSuggested: 3,
      scanCursorBefore: 0,
      scanCursorAfter: 121,
    });

    const row = run.toRow(at('2026-09-17T02:03:01Z'));

    expect(row.status).toBe('ok');
    expect(row.duration_ms).toBe(181_000);
    expect(row.watchlist_evaluated).toBe(32);
    expect(row.scan_suggested).toBe(3);
    expect(row.scan_cursor_before).toBe(0);
    expect(row.scan_cursor_after).toBe(121);
    expect(row.error_message).toBeNull();
    expect(row.log).toEqual(['fetching 32 tickers']);
  });

  it('promotes the first failure out of the stages, with its stack', () => {
    const run = new CronRunRecorder('nightly-scan', at('2026-09-17T02:00:00Z'));
    run.succeeded('watchlist', 61_000, { count: 32 });
    run.failed('scan', 4_000, new Error('universe query failed: bad filter'));

    const row = run.toRow(at('2026-09-17T02:01:05Z'));

    expect(row.status).toBe('partial');
    expect(row.error_stage).toBe('scan');
    expect(row.error_message).toBe('universe query failed: bad filter');
    expect(row.error_stack).toContain('Error: universe query failed');
    expect(row.log.join(' ')).toContain('scan failed: universe query failed');
  });

  it('turns a non-Error throw into something readable', () => {
    const run = new CronRunRecorder();
    run.failed('scan', 1, 'connection reset');

    expect(run.toRow().error_message).toBe('connection reset');
  });

  /** The three nights, told apart. */
  it('distinguishes a skipped scan from a failed one and from an empty one', () => {
    const skipped = new CronRunRecorder();
    skipped.succeeded('watchlist', 1, { count: 32 });
    skipped.skipped('scan', 'disabled', { scanBatchSize: 'disabled' });

    const failed = new CronRunRecorder();
    failed.succeeded('watchlist', 1, { count: 32 });
    failed.failed('scan', 1, new Error('provider timeout'));

    const empty = new CronRunRecorder();
    empty.succeeded('watchlist', 1, { count: 32 });
    empty.succeeded('scan', 1, { count: 0 });

    expect(skipped.toRow().stages.scan.skippedReason).toBe('disabled');
    expect(skipped.toRow().error_message).toBeNull();

    expect(failed.toRow().stages.scan.skippedReason).toBeUndefined();
    expect(failed.toRow().error_message).toBe('provider timeout');

    expect(empty.toRow().stages.scan).toMatchObject({ ok: true, count: 0 });
    expect(empty.toRow().status).toBe('ok');

    expect(new Set([skipped.status, failed.status, empty.status])).toEqual(
      new Set(['partial', 'partial', 'ok']),
    );
  });

  describe('save', () => {
    const clientWith = (insert: ReturnType<typeof vi.fn>) =>
      ({ from: vi.fn(() => ({ insert })) }) as never;

    it('writes one row and says so', async () => {
      const insert = vi.fn().mockResolvedValue({ error: null });
      const run = new CronRunRecorder();
      run.succeeded('watchlist', 1, { count: 1 });

      await expect(run.save(clientWith(insert))).resolves.toEqual({ saved: true });
      expect(insert).toHaveBeenCalledTimes(1);
    });

    /**
     * A run that did its work and then could not describe itself has still done
     * its work. Telemetry that can fail the run it describes is worse than none.
     */
    it('never throws when the write fails', async () => {
      const rejecting = vi.fn().mockRejectedValue(new Error('no such table'));
      const erroring = vi.fn().mockResolvedValue({ error: { message: 'permission denied' } });

      await expect(new CronRunRecorder().save(clientWith(rejecting))).resolves.toEqual({
        saved: false,
        error: 'no such table',
      });
      await expect(new CronRunRecorder().save(clientWith(erroring))).resolves.toEqual({
        saved: false,
        error: 'permission denied',
      });
    });
  });
});
