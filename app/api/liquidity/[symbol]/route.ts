import { NextResponse, type NextRequest } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { createClient } from '@/lib/supabase/server';
import { readLiquidity } from '@/lib/data/liquidity';

export const dynamic = 'force-dynamic';

/**
 * Live liquidity for one symbol.
 *
 * Fetched per request rather than stored on the nightly snapshot, and that
 * is the whole design decision. A quoted spread is only meaningful while the
 * market is open; the nightly job runs at 02:00 UTC, when it never is. Asking
 * at the moment somebody is looking at the page is the only way the number
 * can be true.
 *
 * Average daily volume would survive being cached, but splitting one small
 * quote across two mechanisms to save a single fast call is not a trade worth
 * making — and keeping it out of the nightly run keeps it away from the
 * seventeen seconds of headroom that run has left.
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

  try {
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const quote = (await yf.quote(symbol)) as unknown as Record<string, unknown> | undefined;
    if (!quote) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const liquidity = readLiquidity({
      price: (quote.regularMarketPrice as number) ?? null,
      currency: (quote.currency as string) ?? null,
      bid: (quote.bid as number) ?? null,
      ask: (quote.ask as number) ?? null,
      averageDailyVolume: (quote.averageDailyVolume3Month as number) ?? null,
      marketState: (quote.marketState as string) ?? null,
    });

    return NextResponse.json(liquidity, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Same rule as the insider block: a supporting figure that cannot be
    // fetched shows nothing, and never turns a stock page into an error.
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
