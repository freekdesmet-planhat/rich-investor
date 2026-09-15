/**
 * Somewhere client-side failures can actually be seen.
 *
 * The page that hung for a week threw nothing anyone could read: no error
 * boundary, nothing in the terminal, and whatever the browser knew stayed in
 * the browser. This endpoint is the other half of that — the client reports
 * what it hit, and it lands in the server log, which on Netlify means the
 * function log rather than a console nobody has open.
 *
 * Deliberately small and deliberately cheap to abuse: it writes nothing to the
 * database, holds no state, and is rate limited per caller. A public endpoint
 * that logged without limit would be a way to fill someone's log quota.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/** Enough for a page that is failing repeatedly, not enough to be a firehose. */
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

const clamp = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, max) : null;

export async function POST(request: NextRequest) {
  // Keyed on the forwarded address rather than a session: an error worth
  // reporting may well be one that happened before anybody signed in.
  const caller = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!rateLimit(`client-error:${caller}`, RATE_LIMIT, RATE_WINDOW_MS).ok) {
    return new NextResponse(null, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return new NextResponse(null, { status: 400 });

  const report = {
    kind: clamp(body.kind, 40) ?? 'unknown',
    message: clamp(body.message, 500) ?? '(no message)',
    url: clamp(body.url, 300),
    digest: clamp(body.digest, 100),
    stack: clamp(body.stack, 2_000),
    userAgent: clamp(request.headers.get('user-agent'), 200),
  };

  // One line, so it is greppable in a log that is mostly request records.
  console.error(`[client-error] ${report.kind} at ${report.url ?? '(no url)'}: ${report.message}`);
  if (report.digest) console.error(`[client-error]   digest ${report.digest}`);
  if (report.stack) console.error(`[client-error]   ${report.stack.split('\n').slice(0, 6).join(' | ')}`);

  // 204: the client has nothing to do with the answer, and a body would only
  // be one more thing that could fail on a page that is already failing.
  return new NextResponse(null, { status: 204 });
}
