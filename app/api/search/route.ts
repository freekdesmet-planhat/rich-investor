import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchUniverse } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

/**
 * Typeahead for the shared search box (round 2, items 6 and 8).
 *
 * Reads through the session client, so it is only useful to a signed-in member
 * and returns exactly what searchUniverse would on the search page — one source
 * of truth for what is findable. Kept small: a few fields, capped results.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ results: [] }, { status: 401 });

  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return NextResponse.json({ results: [] });

  const matches = await searchUniverse(q, 8);
  const results = matches.map((m) => ({ symbol: m.symbol, name: m.name, exchange: m.exchange }));
  return NextResponse.json({ results });
}
