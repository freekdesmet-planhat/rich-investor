/**
 * The nightly job (build step 7 automation, step 14 scheduling).
 *
 * Runs the whole pipeline once: market context, then the watchlist, then a
 * batch of the universe scan, then the buy-signal emails. Triggered by
 * Supabase's pg_cron at 02:00 UTC — comfortably after the US close, which is
 * the point of scheduling it at night at all.
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
import { runScan } from '@/lib/pipeline/scan';
import {
  observedMsPerCandidate,
  scanBudget,
  RUN_CEILING_MS,
} from '@/lib/pipeline/scanBudget';
import {
  mergeScanState,
  readScanStateFrom,
  type ScanState,
} from '@/lib/pipeline/scanState';
import { isAuthorisedCron } from '@/lib/auth/cronSecret';

/** Long enough for a full run; Netlify caps background functions well above this. */
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
  const log: string[] = [];
  const started = Date.now();

  // --- 1. Watchlist: ratios, signals, macro context, and the alerts ---------
  // The watchlist is what the emails are about, so it runs first and its
  // failure is the one worth reporting as a failure.
  let watchlist;
  const watchlistStarted = Date.now();
  try {
    const symbols = await watchlistSymbols(client);
    watchlist = await runDailyPipeline({
      client,
      symbols,
      onProgress: (message) => log.push(message),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, stage: 'watchlist', error: (error as Error).message, log },
      { status: 500 },
    );
  }

  // --- 2. Universe scan -----------------------------------------------------
  // A batch, not a sweep: there are ~6,800 large-cap candidates and each needs
  // a fundamentals round-trip, so the cursor advances a little each night and
  // the feed fills in over time. Estimates are skipped inside the scan for the
  // same reason — FMP allows roughly 250 requests a day.
  const watchlistMs = Date.now() - watchlistStarted;

  let scan = null;
  const state = await readScanState(client);
  // Whatever is left of the run, in candidates — see scanBudget.ts. The
  // watchlist has already been paid for by this point, so this is literally
  // the remainder rather than a share reserved in advance.
  const budget = scanBudget({
    ceilingMs: RUN_CEILING_MS,
    elapsedMs: Date.now() - started,
    msPerCandidate: state.msPerCandidate,
    override: process.env.SCAN_BATCH_SIZE,
  });
  log.push(
    `scan budget: ${budget.limit} candidates (${Math.round(budget.remainingMs / 1000)}s left ` +
      `at ~${budget.msPerCandidate}ms each, ${budget.reason})`,
  );

  if (budget.limit > 0) {
    try {
      const scanStarted = Date.now();
      scan = await runScan({
        client,
        limit: budget.limit,
        cursor: state.cursor,
        onProgress: (message) => log.push(message),
      });

      // What it actually cost, carried into tomorrow so the estimate converges
      // on this deployment's own providers rather than a guess made here.
      const attempted = scan.evaluated + scan.skipped;
      await saveScanState(client, {
        cursor: scan.nextCursor,
        msPerCandidate:
          observedMsPerCandidate(Date.now() - scanStarted, attempted, state.msPerCandidate) ??
          state.msPerCandidate,
      });
    } catch (error) {
      // A scan failure must not discard a completed watchlist run.
      log.push(`scan failed (continuing): ${(error as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    durationSeconds: Math.round((Date.now() - started) / 1000),
    watchlist: {
      evaluated: watchlist.rows.length,
      buyWorthy: watchlist.rows.filter((row) => row.status === 'buy_worthy').length,
      newSignals: watchlist.rows.filter((row) => row.becameBuyWorthy).map((row) => row.symbol),
      violations: watchlist.rows.flatMap((row) => row.violations),
    },
    notifications: watchlist.notifications,
    watchlistSeconds: Math.round(watchlistMs / 1000),
    scanBudget: {
      limit: budget.limit,
      reason: budget.reason,
      msPerCandidate: budget.msPerCandidate,
      secondsLeft: Math.round(budget.remainingMs / 1000),
    },
    scan: scan
      ? { evaluated: scan.evaluated, suggested: scan.suggested, nextCursor: scan.nextCursor }
      : null,
    log,
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

/**
 * The scan cursor, kept in `settings` under a reserved row so consecutive
 * nights walk through the universe instead of rescanning its first page.
 */

/**
 * Several rows, not one.
 *
 * The macro refresh at the top of this run has already inserted today's row
 * with an empty `detail`, so "the newest row" is today's and holds nothing —
 * which is how the cursor came back as zero every single night. A short window
 * of recent days is read and the most recent value that actually exists wins;
 * see scanState.ts.
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
    scanBatchSize: scanBudget({ elapsedMs: 0, override: process.env.SCAN_BATCH_SIZE }).limit,
  });
}
