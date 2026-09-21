import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** TEMPORARY diagnostic: is EDGAR refusing our User-Agent, or our IP? */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  const ua = request.nextUrl.searchParams.get('ua') ?? '';
  const targets = [
    'https://www.sec.gov/files/company_tickers.json',
    'https://data.sec.gov/submissions/CIK0000320193.json',
  ];
  const uas: Array<[string, string]> = [
    ['configured', process.env.SEC_USER_AGENT ?? '(unset)'],
    ['fallback', 'rich-investor-app (personal analysis tool; contact via repo)'],
  ];
  if (ua) uas.push(['supplied', ua]);

  const results: Record<string, unknown> = { secUserAgentSet: Boolean(process.env.SEC_USER_AGENT) };
  for (const [label, value] of uas) {
    for (const url of targets) {
      const key = `${label} ${new URL(url).hostname}`;
      try {
        const r = await fetch(url, {
          headers: { 'User-Agent': value, accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
          cache: 'no-store',
        });
        results[key] = r.status;
      } catch (e) {
        results[key] = `threw: ${String(e).slice(0, 80)}`;
      }
    }
  }
  return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
