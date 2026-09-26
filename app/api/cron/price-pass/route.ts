/**
 * The nightly price pass (A12b), on its own schedule and request.
 *
 * Scheduled at 02:12 UTC — after the 02:10 digest and before the 02:15 universe
 * scan — so the scan always reads a priority queue this pass has finished
 * writing. It batch-quotes the large universe for price and market cap only,
 * writes real caps back to the universe (A1c label healing, universe-wide), and
 * queues any name that has just crossed a 45% or 50% decline since its last full
 * evaluation for the scan to evaluate first. See lib/pipeline/pricePass.ts.
 *
 * It shares the scan's circuit breaker: if the provider is already throttling us
 * tonight, this stands down rather than add to the pressure, and if it is the one
 * that hits the throttling, it trips the breaker so the scan slice stands down
 * too. The quote provider is unofficial and single-IP; that shared brake is the
 * point.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { isAuthorisedCron } from '@/lib/auth/cronSecret';
import { runPricePass } from '@/lib/pipeline/pricePass';
import { isBreakerOpen, readScanControl, tripBreaker } from '@/lib/pipeline/scanState';
import { CronRunRecorder } from '@/lib/pipeline/cronRun';

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
  const run = new CronRunRecorder('price-pass');
  const started = run.startedAt.getTime();

  const opened = await run.begin(client);
  if (!opened.started) run.log(`cron_runs could not be opened: ${opened.error}`);

  const reaped = await CronRunRecorder.reapStale(client);
  if (reaped.reaped > 0) run.log(`marked ${reaped.reaped} abandoned run(s) as timed out`);

  const today = new Date().toISOString().slice(0, 10);
  const control = await readScanControl(client);

  // Shared brake with the scan: if an earlier step tonight was rate-limited, do
  // not add to it.
  if (isBreakerOpen(control.breakerDate, today)) {
    run.skipped('price-pass', 'circuit breaker open: a provider rate-limited an earlier step tonight');
    const telemetry = await run.finish(client);
    return NextResponse.json({ ok: true, status: run.status, skipped: 'breaker', telemetry, log: run.logLines });
  }

  const passStarted = Date.now();
  try {
    const result = await runPricePass({ client, asOf: today, onProgress: (m) => run.log(m) });

    // If the pass itself hit the provider's rate limit, trip the breaker so the
    // 02:15 scan stands down rather than push a throttled provider further.
    if (result.throttled) {
      await tripBreaker(client, today);
      run.log('circuit breaker tripped: provider rate-limiting; the scan will skip');
    }

    run.succeeded('price-pass', Date.now() - passStarted, {
      count: result.priced,
      detail: {
        cohort: result.cohort,
        priced: result.priced,
        capsWritten: result.capsWritten,
        requests: result.requests,
        queued: result.queued,
        throttled: result.throttled,
        retired: result.retired,
      },
    });

    const telemetry = await run.finish(client);
    return NextResponse.json({
      ok: run.status !== 'failed',
      status: run.status,
      durationSeconds: Math.round((Date.now() - started) / 1000),
      pricePass: {
        cohort: result.cohort,
        priced: result.priced,
        capsWritten: result.capsWritten,
        requests: result.requests,
        queued: result.queued,
        throttled: result.throttled,
        retired: result.retired,
      },
      telemetry,
      log: run.logLines,
    });
  } catch (error) {
    run.failed('price-pass', Date.now() - passStarted, error);
    const telemetry = await run.finish(client);
    return NextResponse.json(
      { ok: false, status: run.status, error: (error as Error).message, telemetry, log: run.logLines },
      { status: 500 },
    );
  }
}

/** GET is a health check. */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ready: env.hasCronSecret() && env.hasSupabaseAdmin(),
    authorised: isAuthorisedCron(request.headers),
  });
}
