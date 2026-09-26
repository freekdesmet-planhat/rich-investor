import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/** The three companies shown as read-only demos on the public site (item 11). */
export const DEMO_SYMBOLS = ['ASML.AS', 'HEIA.AS', 'AAPL'] as const;
export type DemoSymbol = (typeof DEMO_SYMBOLS)[number];

export function isDemoSymbol(symbol: string): symbol is DemoSymbol {
  return (DEMO_SYMBOLS as readonly string[]).includes(symbol);
}

/**
 * How many focus-sector companies the app checks, for the landing cadence line.
 *
 * Counted live from the most recent evaluation date — on a single date each
 * company appears once, so a head count of that day's non-outside rows is the
 * distinct company count, cheaply. Read with the service-role client because the
 * landing page is public and signal_history is behind RLS.
 */
export async function getFocusCompanyCount(): Promise<number> {
  const admin = createAdminClient();
  const { data: latest } = await admin
    .from('signal_history')
    .select('as_of')
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle<{ as_of: string }>();
  if (!latest) return 0;

  const { count } = await admin
    .from('signal_history')
    .select('symbol', { count: 'exact', head: true })
    .eq('as_of', latest.as_of)
    .neq('focus_sector', 'outside_focus');
  return count ?? 0;
}

import type { SignalRow, SnapshotRow, RatioRow, Translation } from './queries';
import type { Lang } from '@/lib/i18n/config';

export interface DemoStock {
  signal: SignalRow;
  snapshot: SnapshotRow | null;
  ratios: RatioRow[];
  docs: Map<string, Translation>;
}

const SNAPSHOT_COLUMNS =
  'symbol,as_of,price,currency,market_cap_usd,quote,price_history,estimates,' +
  'income_annual,income_quarterly,balance_annual,balance_quarterly,cash_annual,cash_quarterly,' +
  'filing_currency,statement_sources,estimates_source,is_stale,fetch_errors';

/**
 * Everything a read-only demo stock page needs, read with the service-role client.
 *
 * The demos are public (launch item 11), so they cannot go through the session
 * client's RLS. Scoped to the three allowed symbols by the caller; this only
 * reads, and never anything a signed-in member could not already see on the same
 * ticker. Returns null when the symbol has no evaluation to show.
 */
export async function getDemoStock(symbol: string, lang: Lang): Promise<DemoStock | null> {
  const admin = createAdminClient();

  const { data: signal } = await admin
    .from('signal_history')
    .select('*')
    .eq('symbol', symbol)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle<SignalRow>();
  if (!signal) return null;

  const [{ data: snapshot }, { data: ratios }, { data: translations }] = await Promise.all([
    admin
      .from('daily_snapshots')
      .select(SNAPSHOT_COLUMNS)
      .eq('symbol', symbol)
      .order('as_of', { ascending: false })
      .limit(1)
      .maybeSingle<SnapshotRow>(),
    admin.from('ratios').select('*').eq('symbol', symbol).eq('as_of', signal.as_of).returns<RatioRow[]>(),
    admin
      .from('translations')
      .select('namespace,key,field,value')
      .eq('lang', lang)
      .returns<Array<{ namespace: string; key: string; field: string; value: string }>>(),
  ]);

  const docs = new Map<string, Translation>();
  for (const row of translations ?? []) {
    const id = `${row.namespace}:${row.key}`;
    const entry = docs.get(id) ?? { name: '', target: '', explanation: '' };
    if (row.field === 'name') entry.name = row.value;
    if (row.field === 'target') entry.target = row.value;
    if (row.field === 'explanation') entry.explanation = row.value;
    docs.set(id, entry);
  }

  return { signal, snapshot: snapshot ?? null, ratios: ratios ?? [], docs };
}
