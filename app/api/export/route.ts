/**
 * Everything you put into this app, back out again.
 *
 * The watchlist can be rebuilt from providers and so can every ratio. What
 * cannot is the part you supplied: which companies you chose to follow, what
 * you concluded about them and when you changed your mind, and what you own.
 * That is worth being able to take away, and worth being able to keep a copy of
 * without asking anyone.
 *
 * Read through the session, so RLS decides what is in it — the reviews and
 * positions are yours alone, the watchlist is the household's.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const [watchlist, reviews, notes, history, positions] = await Promise.all([
    supabase.from('watchlist_items').select('symbol,name,focus_sector,added_via,created_at'),
    supabase
      .from('qualitative_reviews')
      .select('symbol,assessment,catalysts,sell_signals,marks_answer,assessed_at,updated_at')
      .eq('user_id', user.id),
    supabase.from('qualitative_notes').select('symbol,note,noted_on').eq('user_id', user.id),
    supabase
      .from('qualitative_review_history')
      .select('symbol,assessment,catalysts,sell_signals,marks_answer,saved_at')
      .eq('user_id', user.id),
    supabase
      .from('positions')
      .select('symbol,entry_price,entry_date,quantity,currency,note')
      .eq('user_id', user.id),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    account: user.email,
    watchlist: watchlist.data ?? [],
    reviews: reviews.data ?? [],
    notes: notes.data ?? [],
    reviewHistory: history.data ?? [],
    positions: positions.data ?? [],
  };

  const filename = `rich-investor-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Downloaded rather than rendered: this is a file to keep, and a browser
      // showing 200KB of JSON in a tab is not that.
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
