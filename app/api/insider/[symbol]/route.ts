import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getInsiderActivity } from '@/lib/data/insider';

export const dynamic = 'force-dynamic';

/**
 * Insider activity for one symbol.
 *
 * Its own route rather than part of the stock page's render, because a cold
 * refresh is seconds of EDGAR round-trips and the page has no business
 * waiting on it. The page renders, and the block fills in.
 *
 * Signed in only. The data is public — they are SEC filings — but the fetch
 * is expensive and shared, and an open endpoint would let anyone make this
 * deployment hammer EDGAR on their behalf.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorised' }, { status: 401 });

  const { symbol } = await params;
  const activity = await getInsiderActivity(symbol.toUpperCase());

  // Null means the cache is unreachable, which is a server problem; an
  // activity with no transactions is a real answer and returns 200.
  if (!activity) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  return NextResponse.json(activity, { headers: { 'Cache-Control': 'no-store' } });
}
