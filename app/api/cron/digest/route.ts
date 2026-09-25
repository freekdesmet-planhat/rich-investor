/**
 * The daily digest, on its own schedule.
 *
 * The digest already runs at the end of the nightly pipeline, which is the
 * right place for it: it reports on what that run computed. This endpoint
 * exists for the cases that are not that — sending the digest at a different
 * hour from the scan, re-running it after a failed send, or triggering one by
 * hand — without re-running the whole pipeline and its market-data fetches.
 *
 * It reads what the last run stored rather than recomputing anything, so it is
 * cheap and can be called repeatedly. The per-recipient, per-day row in
 * `notifications_log` is what stops a second call sending a second email.
 *
 * A machine calls this, not a person, so there is no session: the shared secret
 * is the whole boundary, and an unconfigured deployment is closed, not open.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { isAuthorisedCron } from '@/lib/auth/cronSecret';
import { sendDailyDigest, type DigestEntry } from '@/lib/pipeline/digest';
import type { SignalStatus } from '@/lib/signal/buyWorthy';

export const dynamic = 'force-dynamic';
/** Reads and sends only; it does no market-data work. */
export const maxDuration = 60;

interface SignalRow {
  symbol: string;
  as_of: string;
  status: SignalStatus;
  previous_status: SignalStatus | null;
  conditions_met: number;
  conditions_applicable: number;
  checklist: Array<{ key: string; applicable: boolean; passed: boolean; value: number | null }>;
  ratio_snapshot: Record<string, number | null> | null;
}

export async function POST(request: NextRequest) {
  if (!isAuthorisedCron(request.headers)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  if (!env.hasSupabaseAdmin()) {
    return NextResponse.json({ error: 'supabase not configured' }, { status: 500 });
  }

  const client = createAdminClient();

  // Membership decides what the digest covers, the same way the watchlist page
  // does — a ticker taken off the list should stop being reported on.
  const { data: items, error: itemsError } = await client
    .from('watchlist_items')
    .select('symbol,name')
    .returns<Array<{ symbol: string; name: string | null }>>();

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const names = new Map((items ?? []).map((i) => [i.symbol, i.name]));
  if (names.size === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, failed: 0, reason: 'empty watchlist' });
  }

  const { data: signals } = await client
    .from('signal_history')
    .select('symbol,as_of,status,previous_status,conditions_met,conditions_applicable,checklist,ratio_snapshot')
    .in('symbol', [...names.keys()])
    .order('as_of', { ascending: false })
    .returns<SignalRow[]>();

  const newest = new Map<string, SignalRow>();
  for (const row of signals ?? []) if (!newest.has(row.symbol)) newest.set(row.symbol, row);

  if (newest.size === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, failed: 0, reason: 'nothing evaluated yet' });
  }

  const asOf = [...newest.values()][0].as_of;

  // The stored summaries, so a flip can carry the reasoning that goes with it.
  const { data: summaries } = await client
    .from('ticker_summaries')
    .select('symbol,lang,thesis')
    .in('symbol', [...newest.keys()])
    .returns<Array<{ symbol: string; lang: string; thesis: string }>>();

  const thesisFor = new Map((summaries ?? []).map((s) => [`${s.symbol}:${s.lang}`, s.thesis]));

  const entries: DigestEntry[] = [...newest.values()].map((row) => {
    const snapshot = row.ratio_snapshot ?? {};
    return {
      symbol: row.symbol,
      name: names.get(row.symbol) ?? null,
      status: row.status,
      previousStatus: row.previous_status,
      conditionsMet: row.conditions_met,
      conditionsApplicable: row.conditions_applicable,
      missing: (row.checklist ?? []).filter((c) => c.applicable && !c.passed).map((c) => c.key),
      peg: snapshot.peg ?? null,
      forwardPeg: null,
      roe: snapshot.roe ?? null,
      roa: snapshot.roa ?? null,
      drawdown: snapshot.drawdown_5y ?? null,
      // Filled per recipient below; the language is not known here.
      thesis: null,
    };
  });

  const baseUrl = env.siteUrl() ?? '';

  const outcomes = await sendDailyDigest(client, entries, asOf, {
    baseUrl,
    onProgress: (message) => console.log(`[digest] ${message}`),
    // The summary belongs to a language, and the language belongs to a
    // recipient, so it is attached when the digest for that reader is built.
    // `sendDailyDigest` builds per recipient, which is where this lands.
    perRecipient: (lang) =>
      entries.map((entry) => ({ ...entry, thesis: thesisFor.get(`${entry.symbol}:${lang}`) ?? null })),
  });

  // A simulated send is not a send. Counting it as one would report success to
  // whatever is watching this endpoint while no mail left the building — the
  // same lie the notifications_log deliberately refuses to record.
  const sent = outcomes.filter((o) => o.state === 'sent' && !o.simulated).length;
  const simulated = outcomes.filter((o) => o.simulated).length;
  const skipped = outcomes.filter((o) => o.state === 'skipped' && !o.simulated).length;
  const failed = outcomes.filter((o) => o.state === 'failed').length;

  return NextResponse.json({
    ok: failed === 0,
    asOf,
    evaluated: entries.length,
    recipients: outcomes.length,
    sent,
    /** Built and logged, but not sent: no RESEND_API_KEY is configured. */
    simulated,
    skipped,
    failed,
    outcomes,
  });
}

/** GET reports readiness without sending anything. */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    ready: env.hasCronSecret() && env.hasSupabaseAdmin() && env.hasResend(),
    authorised: isAuthorisedCron(request.headers),
    canSendMail: env.hasResend(),
    linksTo: env.siteUrl() ?? null,
  });
}
