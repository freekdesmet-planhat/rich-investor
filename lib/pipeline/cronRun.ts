/**
 * The nightly run's account of itself, written to `cron_runs`.
 *
 * The run already produced everything here — a per-stage log, the budget it
 * computed, the counts, the cursor it moved — and returned all of it as an HTTP
 * response body to pg_net, which throws the body away. The effect was that the
 * only evidence a night left behind was its side effects, and those cannot
 * distinguish the three things that matter:
 *
 *   a scan that was skipped (no time, or `SCAN_BATCH_SIZE=0`),
 *   a scan that threw and was swallowed by the `continuing` catch,
 *   a scan that ran and simply found nothing worth suggesting.
 *
 * All three leave no new suggestions and an unmoved cursor. Three nights went
 * by in that state before anyone asked.
 *
 * The recorder is deliberately dumb: it holds fields, and the mapping to a row
 * is a pure function so it can be tested without a database. Saving is the only
 * part that touches Supabase, and it swallows its own errors — telemetry that
 * can fail the run it is describing is worse than no telemetry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * `running` is the one that matters most.
 *
 * A row left at `running` is a run that never came back — the only trace a
 * process killed by the platform is able to leave, because by definition no
 * code of ours executed after it died.
 */
export type CronRunStatus = 'running' | 'ok' | 'partial' | 'failed' | 'timed_out';

/**
 * How long a run may sit at `running` before it is presumed dead.
 *
 * Generous on purpose. The nightly job's own ceiling is five minutes, so
 * anything still open after ten is not slow, it is gone — and the cost of
 * waiting a little longer to say so is nothing, while the cost of reaping a
 * run that was merely slow is a row that lies about a run that succeeded.
 */
export const STALE_RUN_MINUTES = 10;

/** Why a stage produced no work, when it produced none on purpose. */
export type SkipReason = string;

export interface StageRecord {
  ok: boolean;
  durationMs: number;
  /** Items the stage handled — tickers evaluated, candidates scanned. */
  count?: number;
  /** Set when the stage deliberately did nothing. Not a failure. */
  skippedReason?: SkipReason;
  error?: string;
  stack?: string;
  /** Anything else worth keeping: the budget, the cursor, the reason it chose. */
  detail?: Record<string, unknown>;
}

export interface CronRunRow {
  job: string;
  started_at: string;
  /** Null while in flight, and for a run that was killed before finishing. */
  finished_at: string | null;
  duration_ms: number | null;
  status: CronRunStatus;
  stages: Record<string, StageRecord>;
  watchlist_evaluated: number | null;
  scan_evaluated: number | null;
  scan_suggested: number | null;
  scan_cursor_before: number | null;
  scan_cursor_after: number | null;
  error_stage: string | null;
  error_message: string | null;
  error_stack: string | null;
  log: string[];
}

/**
 * The stage whose failure makes the whole run a failure.
 *
 * The watchlist is what the digest, the trend view and the point of the app all
 * depend on. The scan fills a suggestion feed a little at a time and can miss a
 * night without anything being wrong — as long as it is *recorded* as having
 * missed it, which is the entire reason this table exists.
 */
export const REQUIRED_STAGE = 'watchlist';

/**
 * Whole-run status from the stages.
 *
 * `partial` covers both a stage that failed and a stage that was skipped,
 * because from the outside they are the same thing — something the run was
 * meant to do, it did not do. A skip is not an error, but it is not "ok"
 * either, and collapsing it into `ok` would rebuild the blind spot this
 * replaces.
 */
export function deriveStatus(stages: Record<string, StageRecord>): CronRunStatus {
  const entries = Object.entries(stages);
  if (entries.length === 0) return 'failed';

  const required = stages[REQUIRED_STAGE];
  if (required && !required.ok) return 'failed';

  const incomplete = entries.some(([, s]) => !s.ok || s.skippedReason != null);
  return incomplete ? 'partial' : 'ok';
}

export interface CronRunSummary {
  watchlistEvaluated?: number | null;
  scanEvaluated?: number | null;
  scanSuggested?: number | null;
  scanCursorBefore?: number | null;
  scanCursorAfter?: number | null;
}

/** Records one run. One instance per invocation of the nightly route. */
export class CronRunRecorder {
  readonly job: string;
  readonly startedAt: Date;

  /** The row's id once `begin` has opened it. Null when it never got in. */
  private id: string | null = null;

  private readonly stages: Record<string, StageRecord> = {};
  private readonly lines: string[] = [];
  private summary: CronRunSummary = {};

  constructor(job = 'nightly-scan', startedAt: Date = new Date()) {
    this.job = job;
    this.startedAt = startedAt;
  }

  /** A progress line. Passed straight through to the route's own log too. */
  log(message: string): void {
    this.lines.push(message);
  }

  get logLines(): readonly string[] {
    return this.lines;
  }

  succeeded(stage: string, durationMs: number, record: Omit<StageRecord, 'ok' | 'durationMs'> = {}): void {
    this.stages[stage] = { ok: true, durationMs, ...record };
  }

  failed(stage: string, durationMs: number, error: unknown, detail?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : new Error(String(error));
    this.stages[stage] = {
      ok: false,
      durationMs,
      error: err.message,
      stack: err.stack,
      ...(detail ? { detail } : {}),
    };
    this.log(`${stage} failed: ${err.message}`);
  }

  /**
   * A stage that did not run, and why.
   *
   * `ok` stays true because nothing went wrong; `skippedReason` is what keeps
   * it out of the `ok` status. Both facts are true and both are needed.
   */
  skipped(stage: string, reason: SkipReason, detail?: Record<string, unknown>): void {
    this.stages[stage] = { ok: true, durationMs: 0, skippedReason: reason, ...(detail ? { detail } : {}) };
    this.log(`${stage} skipped: ${reason}`);
  }

  /** The counts promoted into their own columns. Merged, so partial calls are fine. */
  record(summary: CronRunSummary): void {
    this.summary = { ...this.summary, ...summary };
  }

  get status(): CronRunStatus {
    return deriveStatus(this.stages);
  }

  get stageRecords(): Readonly<Record<string, StageRecord>> {
    return this.stages;
  }

  /**
   * The row as it stands. Pure, so the shape is testable without a database.
   *
   * Passing no `finishedAt` describes a run still in flight: no end, no
   * duration, and the status the caller asked for rather than a derived one.
   */
  toRow(finishedAt: Date | null = new Date()): CronRunRow {
    const firstFailure = Object.entries(this.stages).find(([, s]) => !s.ok);

    return {
      job: this.job,
      started_at: this.startedAt.toISOString(),
      finished_at: finishedAt?.toISOString() ?? null,
      duration_ms: finishedAt ? Math.max(0, finishedAt.getTime() - this.startedAt.getTime()) : null,
      status: finishedAt ? this.status : 'running',
      stages: this.stages,
      watchlist_evaluated: this.summary.watchlistEvaluated ?? null,
      scan_evaluated: this.summary.scanEvaluated ?? null,
      scan_suggested: this.summary.scanSuggested ?? null,
      scan_cursor_before: this.summary.scanCursorBefore ?? null,
      scan_cursor_after: this.summary.scanCursorAfter ?? null,
      error_stage: firstFailure?.[0] ?? null,
      error_message: firstFailure?.[1].error ?? null,
      error_stack: firstFailure?.[1].stack ?? null,
      log: this.lines,
    };
  }

  /**
   * Closes out runs that never came back.
   *
   * Swept at the start of each run rather than on a schedule of its own: a
   * stale row only matters when someone is reading this table, and the run
   * that is about to write to it is the best-placed thing to tidy up before
   * it does. Nothing here can fail the run — a sweep that errors is skipped
   * and the stale rows simply wait for tomorrow.
   *
   * Note what is *not* set: `duration_ms`. A reaped run's end time is unknown,
   * and the moment it was noticed is not a substitute for it.
   */
  static async reapStale(
    client: SupabaseClient,
    olderThanMinutes = STALE_RUN_MINUTES,
    now: Date = new Date(),
  ): Promise<{ reaped: number; error?: string }> {
    const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000).toISOString();

    try {
      const { data, error } = await client
        .from('cron_runs')
        .update({ status: 'timed_out', finished_at: now.toISOString(), duration_ms: null })
        .eq('status', 'running')
        .lt('started_at', cutoff)
        .select('id');

      if (error) return { reaped: 0, error: error.message };
      return { reaped: (data ?? []).length };
    } catch (error) {
      return { reaped: 0, error: (error as Error).message };
    }
  }

  /**
   * Opens the record, before any work starts.
   *
   * The row goes in at `running` and is updated from here on. A run that is
   * killed — by a function timeout, by the platform reclaiming the process,
   * by anything that does not give JavaScript a chance to run — leaves that
   * row exactly as the last checkpoint left it, and the stage still marked in
   * flight is the stage it died in. That is the only way to learn where,
   * because no code of ours gets to execute on the way out.
   *
   * Never throws: telemetry that can stop the run before it starts is worse
   * than no telemetry. A failed open simply means `finish` falls back to an
   * insert, and the run is recorded the old way.
   */
  async begin(client: SupabaseClient): Promise<{ started: boolean; error?: string }> {
    try {
      const { data, error } = await client
        .from('cron_runs')
        .insert(this.toRow(null))
        .select('id')
        .single();

      if (error) return { started: false, error: error.message };
      this.id = (data as { id: string }).id;
      return { started: true };
    } catch (error) {
      return { started: false, error: (error as Error).message };
    }
  }

  /**
   * Writes progress without ending the run.
   *
   * Called between stages, so the row on disk always reflects the last thing
   * known to have completed. The cost is one update per stage; what it buys is
   * the difference between "the run died somewhere" and "the run died in the
   * scan, 47 seconds in, with the watchlist already safe".
   */
  async checkpoint(client: SupabaseClient): Promise<void> {
    if (this.id == null) return;
    try {
      await client.from('cron_runs').update(this.toRow(null)).eq('id', this.id);
    } catch {
      // Progress is a convenience; losing it must not cost us the run.
    }
  }

  /**
   * Closes the record. Never throws.
   *
   * A run that completed its work and then could not describe itself has still
   * completed its work, and turning that into a 500 would throw away a good
   * night over a bookkeeping failure. The write is reported in the response
   * instead, so a broken telemetry table is visible without being fatal.
   *
   * Falls back to an insert when `begin` never got a row in, so a run is
   * recorded even if the table was unreachable at the start.
   */
  async finish(
    client: SupabaseClient,
    finishedAt: Date = new Date(),
  ): Promise<{ saved: boolean; error?: string }> {
    const row = this.toRow(finishedAt);
    try {
      const { error } =
        this.id != null
          ? await client.from('cron_runs').update(row).eq('id', this.id)
          : await client.from('cron_runs').insert(row);

      if (error) return { saved: false, error: error.message };
      return { saved: true };
    } catch (error) {
      return { saved: false, error: (error as Error).message };
    }
  }
}
