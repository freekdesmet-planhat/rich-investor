/**
 * The universe scan, on its own schedule and in its own request.
 *
 * It used to run at the tail of the nightly job, taking whatever time the
 * watchlist pass had left. That was a sound division of a budget that did not
 * exist: the route asks for `maxDuration = 300`, and this plan grants it
 * roughly sixty seconds of execution before the process is killed — see
 * RUN_CEILING_MS in scanBudget.ts for the measurements. The watchlist alone
 * spends around forty of those, so "whatever is left" was, in practice, not
 * enough to fetch a single candidate. Three nights in a row the scan started
 * and was killed mid-fetch, and because the telemetry was written at the end,
 * it left nothing behind to say so.
 *
 * Splitting it out does not make the ceiling any higher. What it does is give
 * the scan a request of its own to spend, instead of the end of somebody
 * else's — sixty seconds rather than twenty, and no longer contingent on how
 * long the watchlist took that night. The two halves also stop being able to
 * take each other down: the watchlist is what the digest and the trend view
 * depend on, and it has no business failing because a provider was slow to
 * answer a question about a company nobody is watching yet.
 *
 * Scheduled separately in pg_cron (see 0034), fifteen minutes after the
 * watchlist, so the two are never in flight together.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { runScan, SCAN_PAGE_MULTIPLIER } from '@/lib/pipeline/scan';
import { observedMsPerCandidate, scanBudget, RUN_CEILING_MS } from '@/lib/pipeline/scanBudget';
import {
  claimScanBatch,
  isBreakerOpen,
  readScanControl,
  resetScanCursor,
  saveScanCost,
  tripBreaker,
} from '@/lib/pipeline/scanState';
import { readScanQueue } from '@/lib/pipeline/scanQueue';
import { CronRunRecorder } from '@/lib/pipeline/cronRun';
import { isAuthorisedCron } from '@/lib/auth/cronSecret';

/**
 * Asked for, not granted. The measured ceiling is in RUN_CEILING_MS and the
 * budget is taken from that; this stays declared so the intent is on record
 * and so the route needs no change if the plan ever allows it.
 */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!isAuthorisedCron(request.headers)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  if (!env.hasSupabaseAdmin()) {
    return NextResponse.json({ error: 'supabase not configured' }, { status: 500 });
  }

  const client = createAdminClient();

  const run = new CronRunRecorder('universe-scan');
  const started = run.startedAt.getTime();

  const opened = await run.begin(client);
  if (!opened.started) run.log(`cron_runs could not be opened: ${opened.error}`);

  const reaped = await CronRunRecorder.reapStale(client);
  if (reaped.reaped > 0) run.log(`marked ${reaped.reaped} abandoned run(s) as timed out`);
  if (reaped.error) run.log(`could not sweep abandoned runs: ${reaped.error}`);

  const today = new Date().toISOString().slice(0, 10);
  const control = await readScanControl(client);

  // Circuit breaker: if an earlier slice tonight saw the provider throttling us,
  // the rest stand down rather than keep calling it. This is the one guardrail
  // that matters most — the quote provider is unofficial and single-IP, and a
  // slice that ignores a 429 puts the watchlist's own quotes at risk too.
  if (isBreakerOpen(control.breakerDate, today)) {
    run.skipped('scan', 'circuit breaker open: a provider rate-limited an earlier slice tonight');
    const telemetry = await run.finish(client);
    return NextResponse.json({ ok: true, status: run.status, skipped: 'breaker', telemetry, log: run.logLines });
  }

  // The whole request, less the margin. `elapsedMs` is the handful of
  // milliseconds spent opening the record, not forty seconds of watchlist.
  const budget = scanBudget({
    ceilingMs: RUN_CEILING_MS,
    elapsedMs: Date.now() - started,
    msPerCandidate: control.msPerCandidate,
    override: env.scanBatchSize(),
  });
  run.log(
    `scan budget: ${budget.limit} candidates (${Math.round(budget.remainingMs / 1000)}s of ` +
      `${Math.round(RUN_CEILING_MS / 1000)}s at ~${budget.msPerCandidate}ms each, ${budget.reason})`,
  );
  for (const note of budget.notes) run.log(`scan budget: ${note}`);

  const budgetDetail = {
    limit: budget.limit,
    reason: budget.reason,
    msPerCandidate: budget.msPerCandidate,
    remainingMs: budget.remainingMs,
    ceilingMs: RUN_CEILING_MS,
    scanBatchSize: budget.override.kind,
  };

  // Drain the price pass's priority queue first (A12b): names that just crossed
  // a decline line are evaluated ahead of the cursor walk, up to the budget. The
  // cursor then gets whatever is left, so a crash night that queued many names
  // simply spills into the following nights rather than blowing the budget.
  const queued = budget.limit > 0 ? await readScanQueue(client, budget.limit) : [];
  const priorityDrain = queued.slice(0, budget.limit);
  const cursorBudget = budget.limit - priorityDrain.length;
  if (priorityDrain.length > 0) {
    run.log(`draining ${priorityDrain.length} priority name(s) first: ${priorityDrain.join(', ')}`);
  }

  let scan = null;
  const scanStarted = Date.now();

  if (budget.limit > 0) {
    // Reserve only the cursor rows before doing any work, so a slice that
    // overruns can never share a range with the next. The claim advances by the
    // same over-fetch multiple runScan reads. Priority names are addressed by
    // symbol and do not touch the cursor.
    const claimRows = cursorBudget * SCAN_PAGE_MULTIPLIER;
    const start = cursorBudget > 0 ? await claimScanBatch(client, claimRows) : 0;
    try {
      scan = await runScan({
        client,
        limit: cursorBudget,
        cursor: start,
        prioritySymbols: priorityDrain,
        onProgress: (message) => run.log(message),
      });

      // A slice that ran off the end resets the shared cursor, so the next slice
      // starts a fresh pass rather than claiming an empty tail forever.
      if (scan.exhausted) await resetScanCursor(client);

      // Trip the breaker for the rest of tonight if the provider throttled us.
      if (scan.throttled) {
        await tripBreaker(client, today);
        run.log('circuit breaker tripped: provider rate-limiting; later slices will skip');
      }

      // What it actually cost, carried forward so the estimate converges on this
      // deployment's own providers rather than a guess made here.
      const attempted = scan.evaluated + scan.skipped;
      const measured = observedMsPerCandidate(Date.now() - scanStarted, attempted, control.msPerCandidate);
      if (measured != null) await saveScanCost(client, measured);

      run.succeeded('scan', Date.now() - scanStarted, {
        count: scan.evaluated,
        detail: {
          ...budgetDetail,
          suggested: scan.suggested,
          cursorStart: start,
          priorityDrained: priorityDrain.length,
          throttled: scan.throttled,
        },
      });
      run.record({
        scanEvaluated: scan.evaluated,
        scanSuggested: scan.suggested,
        scanCursorBefore: start,
        scanCursorAfter: scan.exhausted ? 0 : start + claimRows,
      });
    } catch (error) {
      run.failed('scan', Date.now() - scanStarted, error, { ...budgetDetail, cursorStart: start });
      run.record({ scanCursorBefore: start, scanCursorAfter: start + claimRows });
    }
  } else {
    run.skipped('scan', budget.reason, budgetDetail);
  }

  const telemetry = await run.finish(client);

  return NextResponse.json({
    ok: run.status !== 'failed',
    status: run.status,
    telemetry,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    scanBudget: {
      limit: budget.limit,
      reason: budget.reason,
      msPerCandidate: budget.msPerCandidate,
      secondsLeft: Math.round(budget.remainingMs / 1000),
    },
    scan: scan
      ? { evaluated: scan.evaluated, suggested: scan.suggested, exhausted: scan.exhausted, throttled: scan.throttled }
      : null,
    log: run.logLines,
  });
}

/** GET is a health check: it reports readiness without running anything. */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ready: env.hasCronSecret() && env.hasSupabaseAdmin(),
    authorised: isAuthorisedCron(request.headers),
    ceilingSeconds: Math.round(RUN_CEILING_MS / 1000),
  });
}
