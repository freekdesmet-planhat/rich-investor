/**
 * A temporary probe for one question: what kind of limit kills the nightly job?
 *
 * The nightly run dies partway through the universe scan and Netlify answers
 * the caller with `504 Inactivity Timeout` — "too much time has passed without
 * sending any data for document". That wording describes an *idle* timeout: a
 * limit on silence, not on duration. If that is what it is, a response that
 * emits a byte now and then survives indefinitely and the scan needs no
 * restructuring at all. If it is really a flat duration cap wearing a
 * misleading name, the scan has to be split across nights instead.
 *
 * Those two futures are very different, and guessing between them on the
 * strength of an error message would be exactly the sort of guess that has
 * already cost this job three nights. So: burn a known amount of time, either
 * silently or while dribbling output, and see which ones come back.
 *
 *   POST /api/cron/timing-probe?seconds=45            silent for 45s
 *   POST /api/cron/timing-probe?seconds=120&stream=1  a byte every 5s for 120s
 *
 * Guarded by the same cron secret as the real jobs, because it does nothing
 * but consume function time and must not be reachable by anyone else.
 *
 * DELETE THIS once the limit is known. It has no purpose afterwards.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorisedCron } from '@/lib/auth/cronSecret';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export async function POST(request: NextRequest) {
  if (!isAuthorisedCron(request.headers)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const seconds = clamp(Number(params.get('seconds') ?? 30), 1, 280);
  const intervalSeconds = clamp(Number(params.get('interval') ?? 5), 1, 60);
  const stream = params.get('stream') === '1' || params.get('stream') === 'true';

  const started = Date.now();
  const elapsed = () => Math.round((Date.now() - started) / 1000);
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // --- silent: one response, sent only at the very end ----------------------
  if (!stream) {
    await wait(seconds * 1000);
    return NextResponse.json({
      mode: 'silent',
      requestedSeconds: seconds,
      actualSeconds: elapsed(),
      finished: true,
    });
  }

  // --- streaming: a line every `interval`, then the same JSON at the end ----
  //
  // The point is the timing of the *first* byte and of every byte after it. A
  // chunked response that keeps arriving is what an idle timeout is looking
  // for; a duration cap will not care.
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        // Sent immediately, so the connection is never silent from the start.
        controller.enqueue(encoder.encode(`{"mode":"stream","beats":[0`));

        for (let at = intervalSeconds; at <= seconds; at += intervalSeconds) {
          await wait(intervalSeconds * 1000);
          controller.enqueue(encoder.encode(`,${elapsed()}`));
        }

        controller.enqueue(
          encoder.encode(
            `],"requestedSeconds":${seconds},"actualSeconds":${elapsed()},"finished":true}`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // Nothing between here and the caller may buffer the whole body, or the
      // response stops being a stream and the probe measures nothing.
      'X-Accel-Buffering': 'no',
    },
  });
}
