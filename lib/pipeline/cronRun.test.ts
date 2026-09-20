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

  describe('an in-flight record', () => {
    it('describes a run with no end as running, with no duration', () => {
      const run = new CronRunRecorder('nightly-scan', at('2026-09-21T02:00:00Z'));
      run.succeeded('watchlist', 47_000, { count: 32 });

      const row = run.toRow(null);

      expect(row.status).toBe('running');
      expect(row.finished_at).toBeNull();
      expect(row.duration_ms).toBeNull();
      // The work already banked is still described, which is the whole point:
      // the row names the stage that had not finished yet.
      expect(row.stages.watchlist).toMatchObject({ ok: true, count: 32 });
      expect(row.stages.scan).toBeUndefined();
    });

    /** Derived status is for a run that ended; `running` is never derived. */
    it('reports a real status again once it ends', () => {
      const run = new CronRunRecorder('nightly-scan', at('2026-09-21T02:00:00Z'));
      run.succeeded('watchlist', 1, { count: 32 });
      run.succeeded('scan', 1, { count: 60 });

      expect(run.toRow(null).status).toBe('running');
      expect(run.toRow(at('2026-09-21T02:01:00Z')).status).toBe('ok');
    });
  });

  describe('begin, checkpoint and finish', () => {
    function fakeTable() {
      const insert = vi.fn(() => ({
        select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null }) })),
      }));
      const eq = vi.fn().mockResolvedValue({ error: null });
      // Typed parameter so the recorded call can be read back below; the
      // value is inspected through `mock.calls`, not used in the stub.
      const update = vi.fn((row: Record<string, unknown>) => ({ eq, row }));
      return { client: { from: vi.fn(() => ({ insert, update })) } as never, insert, update, eq };
    }

    it('opens the row before any work and keeps its id', async () => {
      const t = fakeTable();
      const run = new CronRunRecorder('nightly-scan', at('2026-09-21T02:00:00Z'));

      await expect(run.begin(t.client)).resolves.toEqual({ started: true });
      expect(t.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running', finished_at: null, duration_ms: null }),
      );
    });

    it('updates the open row rather than inserting a second one', async () => {
      const t = fakeTable();
      const run = new CronRunRecorder('nightly-scan', at('2026-09-21T02:00:00Z'));
      await run.begin(t.client);

      run.succeeded('watchlist', 47_000, { count: 32 });
      await run.checkpoint(t.client);
      run.succeeded('scan', 40_000, { count: 60 });
      await run.finish(t.client, at('2026-09-21T02:01:30Z'));

      expect(t.insert).toHaveBeenCalledTimes(1);
      expect(t.update).toHaveBeenCalledTimes(2);
      expect(t.eq).toHaveBeenLastCalledWith('id', 'row-1');
      expect(t.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'ok', duration_ms: 90_000 }),
      );
    });

    /**
     * The checkpoint is what localises a kill: whatever it last wrote is what
     * survives, because nothing of ours runs when the process is taken away.
     */
    it('leaves the watchlist banked and the scan unfinished at the checkpoint', async () => {
      const t = fakeTable();
      const run = new CronRunRecorder('nightly-scan', at('2026-09-21T02:00:00Z'));
      await run.begin(t.client);
      run.succeeded('watchlist', 47_000, { count: 32 });
      await run.checkpoint(t.client);
      // ...and here the process dies. No finish, no further write.

      const written = t.update.mock.calls[0][0] as unknown as {
        status: string;
        stages: Record<string, unknown>;
      };
      expect(written.status).toBe('running');
      expect(written.stages.watchlist).toMatchObject({ ok: true });
      expect(written.stages.scan).toBeUndefined();
    });

    it('still records the run when the row could never be opened', async () => {
      const insert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'unreachable' } }),
        })),
      }));
      const finalInsert = vi.fn().mockResolvedValue({ error: null });
      let call = 0;
      const client = {
        from: vi.fn(() => (call++ === 0 ? { insert } : { insert: finalInsert })),
      } as never;

      const run = new CronRunRecorder();
      await expect(run.begin(client)).resolves.toEqual({ started: false, error: 'unreachable' });

      run.succeeded('watchlist', 1, { count: 32 });
      await expect(run.finish(client)).resolves.toEqual({ saved: true });
      expect(finalInsert).toHaveBeenCalledTimes(1);
    });

    it('never throws from begin or checkpoint', async () => {
      const client = { from: vi.fn(() => { throw new Error('connection reset'); }) } as never;
      const run = new CronRunRecorder();

      await expect(run.begin(client)).resolves.toEqual({ started: false, error: 'connection reset' });
      await expect(run.checkpoint(client)).resolves.toBeUndefined();
    });
  });

  describe('finish', () => {
    const clientWith = (insert: ReturnType<typeof vi.fn>) =>
      ({ from: vi.fn(() => ({ insert })) }) as never;

    it('writes one row and says so', async () => {
      const insert = vi.fn().mockResolvedValue({ error: null });
      const run = new CronRunRecorder();
      run.succeeded('watchlist', 1, { count: 1 });

      await expect(run.finish(clientWith(insert))).resolves.toEqual({ saved: true });
      expect(insert).toHaveBeenCalledTimes(1);
    });

    /**
     * A run that did its work and then could not describe itself has still done
     * its work. Telemetry that can fail the run it describes is worse than none.
     */
    it('never throws when the write fails', async () => {
      const rejecting = vi.fn().mockRejectedValue(new Error('no such table'));
      const erroring = vi.fn().mockResolvedValue({ error: { message: 'permission denied' } });

      await expect(new CronRunRecorder().finish(clientWith(rejecting))).resolves.toEqual({
        saved: false,
        error: 'no such table',
      });
      await expect(new CronRunRecorder().finish(clientWith(erroring))).resolves.toEqual({
        saved: false,
        error: 'permission denied',
      });
    });
  });
});
