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
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runScan } from '@/lib/pipeline/scan';
import { observedMsPerCandidate, scanBudget, RUN_CEILING_MS } from '@/lib/pipeline/scanBudget';
import { mergeScanState, readScanStateFrom, type ScanState } from '@/lib/pipeline/scanState';
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

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'supabase not configured' }, { status: 500 });
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  const run = new CronRunRecorder('universe-scan');
  const started = run.startedAt.getTime();

  const opened = await run.begin(client);
  if (!opened.started) run.log(`cron_runs could not be opened: ${opened.error}`);

  const reaped = await CronRunRecorder.reapStale(client);
  if (reaped.reaped > 0) run.log(`marked ${reaped.reaped} abandoned run(s) as timed out`);
  if (reaped.error) run.log(`could not sweep abandoned runs: ${reaped.error}`);

  const state = await readScanState(client);

  // The whole request, less the margin — where this used to get the remainder
  // of somebody else's. `elapsedMs` is the handful of milliseconds spent
  // opening the record, not forty seconds of watchlist.
  const budget = scanBudget({
    ceilingMs: RUN_CEILING_MS,
    elapsedMs: Date.now() - started,
    msPerCandidate: state.msPerCandidate,
    override: process.env.SCAN_BATCH_SIZE,
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
    cursor: state.cursor,
  };

  let scan = null;
  const scanStarted = Date.now();

  if (budget.limit > 0) {
    try {
      scan = await runScan({
        client,
        limit: budget.limit,
        cursor: state.cursor,
        onProgress: (message) => run.log(message),
      });

      // What it actually cost, carried into tomorrow so the estimate converges
      // on this deployment's own providers rather than a guess made here. It
      // matters more now than it did: against a sixty-second ceiling the
      // pessimistic default of three seconds a candidate buys sixteen of them,
      // and the measured figure is what lifts that to something useful.
      const attempted = scan.evaluated + scan.skipped;
      await saveScanState(client, {
        cursor: scan.nextCursor,
        msPerCandidate:
          observedMsPerCandidate(Date.now() - scanStarted, attempted, state.msPerCandidate) ??
          state.msPerCandidate,
      });

      run.succeeded('scan', Date.now() - scanStarted, {
        count: scan.evaluated,
        detail: { ...budgetDetail, suggested: scan.suggested, nextCursor: scan.nextCursor },
      });
      run.record({
        scanEvaluated: scan.evaluated,
        scanSuggested: scan.suggested,
        scanCursorBefore: state.cursor,
        scanCursorAfter: scan.nextCursor,
      });
    } catch (error) {
      run.failed('scan', Date.now() - scanStarted, error, budgetDetail);
      run.record({ scanCursorBefore: state.cursor, scanCursorAfter: state.cursor });
    }
  } else {
    run.skipped('scan', budget.reason, budgetDetail);
    run.record({ scanCursorBefore: state.cursor, scanCursorAfter: state.cursor });
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
      ? { evaluated: scan.evaluated, suggested: scan.suggested, nextCursor: scan.nextCursor }
      : null,
    log: run.logLines,
  });
}

/**
 * Several rows, not one.
 *
 * The macro refresh in the watchlist run has already inserted today's row with
 * an empty `detail`, so "the newest row" is today's and holds nothing — which
 * is how the cursor came back as zero every single night. A short window of
 * recent days is read and the most recent value that actually exists wins; see
 * scanState.ts.
 */
async function readScanState(client: SupabaseClient): Promise<ScanState> {
  const { data } = await client
    .from('macro_context')
    .select('detail')
    .order('date', { ascending: false })
    .limit(30)
    .returns<Array<{ detail: Record<string, unknown> | null }>>();

  return readScanStateFrom(data ?? []);
}

async function saveScanState(client: SupabaseClient, state: ScanState): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await client
    .from('macro_context')
    .select('detail')
    .eq('date', today)
    .maybeSingle<{ detail: Record<string, unknown> | null }>();

  // Upserted, not updated: if the macro refresh failed earlier there is no row
  // for today, and an update would match nothing and throw the scan's progress
  // away without a word. `date` is the primary key and every other column is
  // nullable, so inserting the day with only its state is valid.
  await client
    .from('macro_context')
    .upsert({ date: today, detail: mergeScanState(data?.detail ?? null, state) }, {
      onConflict: 'date',
    });
}

/** GET is a health check: it reports readiness without running anything. */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ready: Boolean(process.env.CRON_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY),
    authorised: isAuthorisedCron(request.headers),
    ceilingSeconds: Math.round(RUN_CEILING_MS / 1000),
  });
}
