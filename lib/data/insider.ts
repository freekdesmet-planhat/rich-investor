import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import {
  DEFAULT_WINDOW_DAYS,
  fetchInsiderActivity,
  type InsiderActivity,
} from '@/lib/providers/secInsider';

/**
 * Cached insider activity, refreshed lazily.
 *
 * A refresh is seconds of EDGAR round-trips (see secInsider.ts), so it
 * happens when a stock page asks and the row is older than a day — never on
 * the nightly run, which does not have seconds to spare.
 *
 * Written with the service role because the API route that calls this runs
 * on the reader's behalf but writes a shared cache row: two members looking
 * at the same company should not each pay for their own fetch, and the table
 * grants no write policy to `authenticated` precisely so that the only way in
 * is through here.
 */

/** How long a cached answer is good for. Insiders do not file hourly. */
const TTL_HOURS = 24;

export interface CachedInsiderActivity extends InsiderActivity {
  fetchedAt: string;
  /** Set when the last refresh failed; the page shows nothing rather than an error. */
  error: string | null;
}

function admin() {
  if (!env.hasSupabaseAdmin()) return null;
  return createAdminClient();
}

interface Row {
  symbol: string;
  fetched_at: string;
  window_days: number;
  summary: InsiderActivity['summary'];
  transactions: InsiderActivity['transactions'];
  filings_read: number;
  error: string | null;
}

const toActivity = (row: Row): CachedInsiderActivity => ({
  symbol: row.symbol,
  windowDays: row.window_days,
  summary: row.summary,
  transactions: row.transactions ?? [],
  filingsRead: row.filings_read,
  truncated: false,
  fetchedAt: row.fetched_at,
  error: row.error,
});

/**
 * The cached row, refreshed first if it is stale or missing.
 *
 * Never throws. A failure to reach EDGAR is recorded on the row and returned
 * as an answer with no transactions in it — the catalyst checkbox this feeds
 * is a convenience beside a question the reader answers themselves, and it
 * has no business turning a stock page into an error page.
 */
export async function getInsiderActivity(
  symbol: string,
  now: Date = new Date(),
): Promise<CachedInsiderActivity | null> {
  const client = admin();
  if (!client) return null;

  const { data } = await client
    .from('insider_activity')
    .select('symbol,fetched_at,window_days,summary,transactions,filings_read,error')
    .eq('symbol', symbol)
    .maybeSingle<Row>();

  const fresh =
    data && new Date(data.fetched_at).getTime() > now.getTime() - TTL_HOURS * 3_600_000;
  if (fresh) return toActivity(data);

  try {
    const activity = await fetchInsiderActivity(symbol, DEFAULT_WINDOW_DAYS, now);
    await client.from('insider_activity').upsert(
      {
        symbol,
        fetched_at: now.toISOString(),
        window_days: activity.windowDays,
        summary: activity.summary,
        transactions: activity.transactions,
        filings_read: activity.filingsRead,
        error: null,
      },
      { onConflict: 'symbol' },
    );
    return { ...activity, fetchedAt: now.toISOString(), error: null };
  } catch (error) {
    const message = (error as Error).message.slice(0, 300);
    await client.from('insider_activity').upsert(
      {
        symbol,
        fetched_at: now.toISOString(),
        window_days: DEFAULT_WINDOW_DAYS,
        summary: {},
        transactions: [],
        filings_read: 0,
        error: message,
      },
      { onConflict: 'symbol' },
    );
    // A stale answer beats no answer when the refresh is what failed.
    return data ? { ...toActivity(data), error: message } : null;
  }
}
