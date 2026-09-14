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
import { scanBatchSize } from '@/lib/pipeline/scanBudget';
import { isAuthorisedCron } from '@/lib/auth/cronSecret';

/** Long enough for a full run; Netlify caps background functions well above this. */
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * Candidates evaluated per nightly run.
 *
 * Halved from 60 so the night leaves providers and wall clock for analysing a
 * ticker the moment it is added, rather than spending the whole budget filling
 * the suggestion feed. `scanBudget.ts` sets out the arithmetic.
 */

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
  let scan = null;
  try {
    const cursor = await nextCursor(client);
    scan = await runScan({
      client,
      limit: scanBatchSize(),
      cursor,
      onProgress: (message) => log.push(message),
    });
    await saveCursor(client, scan.nextCursor);
  } catch (error) {
    // A scan failure must not discard a completed watchlist run.
    log.push(`scan failed (continuing): ${(error as Error).message}`);
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
    scan: scan
      ? {
          budget: scanBatchSize(),
          evaluated: scan.evaluated,
          suggested: scan.suggested,
          nextCursor: scan.nextCursor,
        }
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
const CURSOR_KEY = 'scan_cursor';

async function nextCursor(client: SupabaseClient): Promise<number> {
  const { data } = await client
    .from('macro_context')
    .select('detail')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle<{ detail: Record<string, unknown> | null }>();

  const value = data?.detail?.[CURSOR_KEY];
  return typeof value === 'number' ? value : 0;
}

async function saveCursor(client: SupabaseClient, cursor: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await client
    .from('macro_context')
    .update({ detail: { [CURSOR_KEY]: cursor } })
    .eq('date', today);
}

/** GET is a health check: it reports readiness without running anything. */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ready: Boolean(process.env.CRON_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY),
    authorised: isAuthorisedCron(request.headers),
    scanBatchSize: scanBatchSize(),
  });
}
