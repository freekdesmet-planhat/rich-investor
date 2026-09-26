/**
 * Generates one AI thesis, in one language, and streams it back.
 *
 * A route handler rather than a server action because the point is to show
 * progress: a server action can only resolve once, so a slow call left the
 * button dead for several seconds with nothing on screen. This streams the text
 * as the model writes it.
 *
 * The protocol is newline-delimited JSON, one object per line:
 *
 *   {"type":"delta","text":"..."}      zero or more, in order
 *   {"type":"done","generatedAt":"..."} exactly one, on success
 *   {"type":"error","code":"..."}       exactly one, instead of `done`
 *
 * An error is always a code from `ThesisErrorCode` (plus `save_failed`,
 * `no_signal` and `not_signed_in`), never the provider's own wording: the page
 * renders a sentence from `thesis.failed` in the reader's language. The
 * provider's text goes to the server log.
 *
 * Nothing is stored unless the stream finished cleanly. A failed or truncated
 * generation leaves no row behind, which is what put placeholder prose on
 * /stock/ADYEN.AS in the first place.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isLang } from '@/lib/i18n/config';
import { rateLimit } from '@/lib/rateLimit';
import { streamThesis, thesisEnabled, ThesisError, type ThesisContext } from '@/lib/ai/thesis';

export const dynamic = 'force-dynamic';
/** A summary takes seconds, not minutes, but the model sets the pace. */
export const maxDuration = 60;

/**
 * Per signed-in user. Generous for a person reading one stock page, and far
 * below what a retry loop would do to the bill.
 */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

interface SignalRow {
  as_of: string;
  status: string;
  lynch_category: string;
  focus_sector: string;
  conditions_met: number;
  conditions_applicable: number;
  peg_basis: string | null;
  checklist: Array<{ key: string; applicable: boolean; passed: boolean; target: string }>;
}

interface RatioRow {
  ratio_key: string;
  value: number | null;
  detail: Record<string, unknown>;
}

const line = (value: unknown) => `${JSON.stringify(value)}\n`;

export async function POST(request: NextRequest) {
  // Order matters. The session comes first, so an anonymous caller learns
  // nothing about this deployment — not even whether the feature is
  // configured — and the rate limit comes before any work, so a signed-in loop
  // is stopped before it can reach the provider or the database.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // The security boundary. Moving off a server action lost the implicit
  // session, and this endpoint spends money on a public URL.
  if (!user) {
    return NextResponse.json({ type: 'error', code: 'not_signed_in' }, { status: 401 });
  }

  const limit = rateLimit(`thesis:${user.id}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { type: 'error', code: 'rate_limited' },
      { status: 429, headers: { 'retry-after': String(limit.retryAfter) } },
    );
  }

  // Without a provider key there is no feature: the page hides the block, and a
  // stray request is refused rather than answered with a placeholder.
  if (!thesisEnabled()) {
    return NextResponse.json({ type: 'error', code: 'disabled' }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as
    | { symbol?: unknown; lang?: unknown }
    | null;
  const symbol = typeof body?.symbol === 'string' ? body.symbol.toUpperCase() : '';
  const lang = typeof body?.lang === 'string' && isLang(body.lang) ? body.lang : null;

  if (!symbol || !lang) {
    return NextResponse.json({ type: 'error', code: 'missing_symbol' }, { status: 400 });
  }

  const { data: signal } = await supabase
    .from('signal_history')
    .select(
      'as_of,status,lynch_category,focus_sector,conditions_met,conditions_applicable,peg_basis,checklist',
    )
    .eq('symbol', symbol)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle<SignalRow>();

  if (!signal) {
    return NextResponse.json({ type: 'error', code: 'no_signal' }, { status: 404 });
  }

  const { data: ratios } = await supabase
    .from('ratios')
    .select('ratio_key,value,detail')
    .eq('symbol', symbol)
    .eq('as_of', signal.as_of)
    .returns<RatioRow[]>();

  const byKey = new Map((ratios ?? []).map((row) => [row.ratio_key, row]));
  const peg = byKey.get('peg');
  const roa = byKey.get('roa');

  const { data: universe } = await supabase
    .from('universe')
    .select('name')
    .eq('symbol', symbol)
    .maybeSingle<{ name: string | null }>();

  const context: ThesisContext = {
    symbol,
    name: universe?.name ?? null,
    focusSector: signal.focus_sector,
    lynchCategory: signal.lynch_category,
    status: signal.status,
    conditionsMet: signal.conditions_met,
    conditionsApplicable: signal.conditions_applicable,
    checklist: signal.checklist ?? [],
    peg: peg?.value ?? null,
    forwardPeg: (peg?.detail?.forwardPeg as number | null) ?? null,
    pegBasis: signal.peg_basis,
    roe: byKey.get('roe')?.value ?? null,
    roa: roa?.value ?? null,
    roaIsAdjusted: Boolean(roa?.detail?.isAdjusted),
    epsGrowth: byKey.get('eps_growth')?.value ?? null,
    debt: byKey.get('debt')?.value ?? null,
    earningsQuality: byKey.get('earnings_quality')?.value ?? null,
    drawdown: byKey.get('drawdown_5y')?.value ?? null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Delivery must never decide whether the row is written. If the reader
      // has gone away, enqueue throws; that is not a generation failure, so it
      // is swallowed and the generation is judged on its own completion. The
      // client going away is handled by `request.signal` instead, which aborts
      // the upstream call so nothing is generated for nobody.
      let delivering = true;
      const send = (value: unknown) => {
        if (!delivering) return;
        try {
          controller.enqueue(encoder.encode(line(value)));
        } catch {
          delivering = false;
        }
      };

      // One full generation, drained to completion. Deltas are not forwarded as
      // they arrive: the numbers guardrail can only run on the finished text, and
      // showing text we might then discard is worse than a short wait. See below.
      const runOnce = async () => {
        const generation = streamThesis(context, lang, request.signal);
        let step = await generation.next();
        while (!step.done) step = await generation.next();
        return step.value;
      };

      try {
        // Every number in the summary must be one we gave the model. On a stray
        // figure streamThesis throws `numbers`; retry once, and a second failure
        // throws through to the catch, which shows nothing (audit A7).
        let result;
        try {
          result = await runOnce();
        } catch (error) {
          if (error instanceof ThesisError && error.code === 'numbers') {
            result = await runOnce();
          } else {
            throw error;
          }
        }

        // The validated text, sent in one piece now that it has passed.
        send({ type: 'delta', text: result.text });

        const generatedAt = new Date().toISOString();
        const { error } = await supabase.from('ticker_summaries').upsert(
          {
            symbol,
            lang: result.lang,
            thesis: result.text,
            model: result.model,
            signal_as_of: signal.as_of,
            signal_status: signal.status,
            signal_conditions_met: signal.conditions_met,
            generated_by: user.id,
            generated_at: generatedAt,
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
          },
          { onConflict: 'symbol,lang' },
        );

        if (error) {
          console.error(`thesis save failed for ${symbol}/${lang}: ${error.message}`);
          send({ type: 'error', code: 'save_failed' });
        } else {
          // Best effort: the row is already written, and the client already has
          // the text. A failure to drop the cached page is not a failed
          // generation, and reporting it as one would be a lie about stored
          // state.
          try {
            revalidatePath(`/stock/${symbol}`);
          } catch (cacheError) {
            console.error(`thesis revalidate failed for ${symbol}:`, cacheError);
          }
          send({ type: 'done', generatedAt });
        }
      } catch (error) {
        // An abort is the reader leaving, not a fault worth logging as one —
        // and nothing has been written, which is the point.
        const aborted = request.signal.aborted || (error as Error)?.name === 'AbortError';
        if (!aborted) {
          console.error(`thesis generation failed for ${symbol}/${lang}:`, error);
          send({
            type: 'error',
            code: error instanceof ThesisError ? error.code : 'unknown',
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the reader going away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      // Netlify and other proxies otherwise buffer the whole body, which would
      // undo the point of streaming it.
      'x-accel-buffering': 'no',
    },
  });
}
