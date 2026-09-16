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

export type CronRunStatus = 'ok' | 'partial' | 'failed';

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
  finished_at: string;
  duration_ms: number;
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

  /** The row to insert. Pure, so the shape is testable without a database. */
  toRow(finishedAt: Date = new Date()): CronRunRow {
    const firstFailure = Object.entries(this.stages).find(([, s]) => !s.ok);

    return {
      job: this.job,
      started_at: this.startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: Math.max(0, finishedAt.getTime() - this.startedAt.getTime()),
      status: this.status,
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
   * Writes the row. Never throws.
   *
   * A run that completed its work and then could not describe itself has still
   * completed its work, and turning that into a 500 would throw away a good
   * night over a bookkeeping failure. The write is reported in the response
   * instead, so a broken telemetry table is visible without being fatal.
   */
  async save(client: SupabaseClient, finishedAt: Date = new Date()): Promise<{ saved: boolean; error?: string }> {
    try {
      const { error } = await client.from('cron_runs').insert(this.toRow(finishedAt));
      if (error) return { saved: false, error: error.message };
      return { saved: true };
    } catch (error) {
      return { saved: false, error: (error as Error).message };
    }
  }
}
