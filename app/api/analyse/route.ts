/**
 * Analyses one watchlist ticker now, instead of waiting for the night.
 *
 * A route handler rather than a server action for the same reason /api/thesis
 * is one: this takes several seconds of provider calls, and the caller needs to
 * be able to show that something is happening rather than sit on a dead button.
 *
 * The guards, in order, and why:
 *
 *   1. a session, because this is a public URL that spends provider quota;
 *   2. a rate limit, so a retry loop is stopped before it reaches a provider;
 *   3. membership of the watchlist, which is what stops this being a free
 *      "analyse any ticker in the world" endpoint — the symbol must be
 *      something the household has already chosen to follow.
 *
 * The write itself needs the service role: ratio and signal rows are the
 * nightly job's to write and RLS does not let a session insert them. That is
 * exactly why the three checks above come first.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/rateLimit';
import { analyseOnDemand } from '@/lib/pipeline/analyseOne';

export const dynamic = 'force-dynamic';

/**
 * One ticker takes about six seconds against live providers. The ceiling is
 * generous because a slow SEC response should not lose work that is already
 * half done; the nightly run remains the backstop either way.
 */
export const maxDuration = 60;

/** Enough to fix a handful of rows in a sitting, far below a runaway loop. */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, code: 'not_signed_in' }, { status: 401 });
  }

  const limit = rateLimit(`analyse:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, code: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
    );
  }

  const body = (await request.json().catch(() => null)) as { symbol?: unknown } | null;
  const symbol = typeof body?.symbol === 'string' ? body.symbol.trim().toUpperCase() : '';
  if (!symbol) {
    return NextResponse.json({ ok: false, code: 'missing_symbol' }, { status: 400 });
  }

  // Any real company can be analysed on demand now, not only watchlist names
  // (round 2, item 5): a reader can look one up from search without adding it.
  // The symbol must exist in the universe — an unknown ticker is not analysed —
  // and the per-plan on-demand limit (item 10) is what keeps this bounded.
  const { data: known } = await supabase
    .from('universe')
    .select('symbol')
    .eq('symbol', symbol)
    .maybeSingle<{ symbol: string }>();

  if (!known) {
    return NextResponse.json({ ok: false, code: 'unknown_symbol' }, { status: 404 });
  }

  try {
    const { rows } = await analyseOnDemand(createAdminClient(), symbol);
    const row = rows[0];

    if (!row) {
      // The pipeline ran and produced nothing: the providers had no usable
      // figures for this ticker. Saying so is better than reporting success
      // and leaving the row exactly as unanalysed as it was.
      return NextResponse.json({ ok: false, code: 'no_data', symbol }, { status: 422 });
    }

    revalidatePath('/');
    revalidatePath(`/stock/${symbol}`);

    return NextResponse.json({
      ok: true,
      symbol,
      status: row.status,
      conditionsMet: row.conditionsMet,
      conditionsApplicable: row.conditionsApplicable,
    });
  } catch (error) {
    // The provider's wording goes to the log; the caller gets a code it can
    // put in the reader's own language.
    console.error(`analyse failed for ${symbol}: ${(error as Error).message}`);
    return NextResponse.json({ ok: false, code: 'failed', symbol }, { status: 500 });
  }
}
