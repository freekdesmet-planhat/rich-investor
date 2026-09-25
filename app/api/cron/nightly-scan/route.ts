/**
 * The nightly job (build step 7 automation, step 14 scheduling).
 *
 * Market context, then a slice of the watchlist, then the per-ticker buy
 * alerts. Triggered by Supabase's pg_cron a few minutes after the US close is
 * long past — the point of scheduling it at night at all.
 *
 * It runs in slices now, not in one pass. The watchlist crept from ~40s toward
 * the ~60s execution ceiling once EDGAR fundamentals came back into it, and on
 * 09-24 and 09-25 it crossed the line and was killed before it wrote anything,
 * freezing every watchlist figure. So the list is cut into `parts` index-slices
 * (see the `part`/`parts` query params), each its own pg_cron schedule a few
 * minutes apart, each comfortably under the ceiling. The universe scan already
 * has its own request for the same reason — see app/api/cron/universe-scan.
 *
 * The daily digest is no longer sent from here: no single slice sees the whole
 * watchlist, so it cannot summarise it. /api/cron/digest assembles it from the
 * stored signals on its own schedule, after the slices have run.
 *
 * Protected by a shared secret rather than a session: the caller is a database
 * job, not a person. The secret is compared in constant time, and a request
 * without it is refused before any work starts.
 *
 * Runs under the service role, because it writes market data on nobody's
 * behalf. RLS does not apply to it, which is exactly why the secret check is
 * the whole security boundary here.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runDailyPipeline, SEED_SYMBOLS } from '@/lib/pipeline/runDaily';
import { isAuthorisedCron } from '@/lib/auth/cronSecret';
import { CronRunRecorder } from '@/lib/pipeline/cronRun';

/**
 * Asked for, not granted: this plan kills the request at roughly sixty
 * seconds, whatever is declared here. The watchlist pass measures around
 * forty, so it fits — but not by much, and RUN_CEILING_MS in scanBudget.ts
 * carries the measurements behind that number.
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

  /**
   * `?notify=false` runs the pipeline without sending anything.
   *
   * For running the job by hand — to reproduce a failure, or to check a fix —
   * without the household receiving a second digest for a day they have
   * already had one for. The scheduled call never passes it, so the nightly
   * run is unaffected; only a person with the cron secret can ask for a quiet
   * run, which is the same bar as triggering one at all.
   */
  const skipNotifications = request.nextUrl.searchParams.get('notify') === 'false';

  /**
   * The watchlist runs in `parts` index-slices, one request each, because a
   * single request that fetches all of it now crosses the ~60s execution
   * ceiling and is killed before it persists — see RUN_CEILING_MS in
   * scanBudget.ts and the 09-24/09-25 timeouts in the Log. Each slice is a
   * separate pg_cron schedule a few minutes apart, so none of them approaches
   * the ceiling. `part` is 0-based; the defaults run the whole list in one
   * request, which is what a by-hand call with no params still does.
   */
  const parts = Math.max(1, Number(request.nextUrl.searchParams.get('parts')) || 1);
  const part = Math.min(parts - 1, Math.max(0, Number(request.nextUrl.searchParams.get('part')) || 0));

  // Everything the run learns about itself goes here and is written to
  // `cron_runs` on every exit path below, including the failing ones. The log
  // array is the recorder's, so a line pushed anywhere reaches the table.
  const run = new CronRunRecorder('nightly-scan');
  const started = run.startedAt.getTime();

  // Opened before any work, so a run that is killed rather than returned still
  // leaves a row. Three nights of this job dying between the watchlist and the
  // scan produced no record at all, because the record was written on the way
  // out and nothing of ours ran on the way out.
  const opened = await run.begin(client);
  if (!opened.started) run.log(`cron_runs could not be opened: ${opened.error}`);

  // Yesterday's corpse, if there is one. A killed run cannot mark itself, so
  // the next run does it — otherwise the table fills with rows that claim to
  // still be going and stops being usable as evidence.
  const reaped = await CronRunRecorder.reapStale(client);
  if (reaped.reaped > 0) run.log(`marked ${reaped.reaped} abandoned run(s) as timed out`);
  if (reaped.error) run.log(`could not sweep abandoned runs: ${reaped.error}`);

  // --- 1. Watchlist: ratios, signals, macro context, and the alerts ---------
  // The watchlist is what the emails are about, so it runs first and its
  // failure is the one worth reporting as a failure.
  let watchlist;
  const watchlistStarted = Date.now();
  try {
    // Deterministic order, so slicing by index is stable from one request to
    // the next and every name lands in exactly one slice.
    const allSymbols = (await watchlistSymbols(client)).slice().sort();
    const size = Math.ceil(allSymbols.length / parts);
    const symbols = allSymbols.slice(part * size, (part + 1) * size);
    run.log(
      `watchlist part ${part + 1}/${parts}: ${symbols.length} of ${allSymbols.length} ` +
        `(${symbols[0] ?? '—'}…${symbols[symbols.length - 1] ?? '—'})`,
    );
    watchlist = await runDailyPipeline({
      client,
      symbols,
      skipNotifications,
      // The digest summarises the whole watchlist, which no single slice sees,
      // so it is left to /api/cron/digest to assemble from the stored signals
      // once every slice has run. Per-ticker buy alerts still go out here.
      skipDigest: true,
      // Market-wide context is a once-a-night job, not a once-a-slice one.
      skipMacro: part > 0,
      onProgress: (message) => run.log(message),
    });
    run.succeeded('watchlist', Date.now() - watchlistStarted, {
      count: watchlist.rows.length,
      detail: {
        part: part + 1,
        parts,
        buyWorthy: watchlist.rows.filter((row) => row.status === 'buy_worthy').length,
        violations: watchlist.rows.flatMap((row) => row.violations).length,
        // Recorded, so a hand-run night is never read later as one where the
        // digest silently failed to go out.
        skipNotifications,
      },
    });
    run.record({ watchlistEvaluated: watchlist.rows.length });
  } catch (error) {
    run.failed('watchlist', Date.now() - watchlistStarted, error);
    const saved = await run.finish(client);
    return NextResponse.json(
      {
        ok: false,
        stage: 'watchlist',
        error: (error as Error).message,
        telemetry: saved,
        log: run.logLines,
      },
      { status: 500 },
    );
  }

  // The scan used to run from here, on whatever time the watchlist had left.
  // It now has its own request and its own schedule — see
  // app/api/cron/universe-scan and RUN_CEILING_MS for why. This route does one
  // job, and the job it does is the one the digest depends on.
  const watchlistMs = Date.now() - watchlistStarted;

  // Written before the response is built, so the record survives a client that
  // hangs up — which pg_net, firing and forgetting, effectively always does.
  const telemetry = await run.finish(client);

  return NextResponse.json({
    ok: true,
    status: run.status,
    skipNotifications,
    part: part + 1,
    parts,
    telemetry,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    watchlist: {
      evaluated: watchlist.rows.length,
      buyWorthy: watchlist.rows.filter((row) => row.status === 'buy_worthy').length,
      newSignals: watchlist.rows.filter((row) => row.becameBuyWorthy).map((row) => row.symbol),
      violations: watchlist.rows.flatMap((row) => row.violations),
    },
    notifications: watchlist.notifications,
    watchlistSeconds: Math.round(watchlistMs / 1000),
    log: run.logLines,
  });
}

/** Everything on the shared watchlist, falling back to the seed list. */
async function watchlistSymbols(client: SupabaseClient): Promise<string[]> {
  const { data } = await client
    .from('watchlist_items')
    .select('symbol')
    .returns<Array<{ symbol: string }>>();

  const symbols = (data ?? []).map((row) => row.symbol);
  return symbols.length > 0 ? symbols : SEED_SYMBOLS;
}

/** GET is a health check: it reports readiness without running anything. */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ready: Boolean(process.env.CRON_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY),
    authorised: isAuthorisedCron(request.headers),
  });
}
