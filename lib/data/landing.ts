import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyScanScreen } from '@/lib/pipeline/scan';
import {
  DEFAULT_SECTOR_RULES,
  resolveFocusSector,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';
import { keepDistinctCompanies } from '@/lib/data/searchFilters';

/** The three companies shown as read-only demos on the public site (item 11). */
export const DEMO_SYMBOLS = ['ASML.AS', 'HEIA.AS', 'AAPL'] as const;
export type DemoSymbol = (typeof DEMO_SYMBOLS)[number];

export function isDemoSymbol(symbol: string): symbol is DemoSymbol {
  return (DEMO_SYMBOLS as readonly string[]).includes(symbol);
}

/**
 * How many focus-sector companies the app checks, for the landing cadence line.
 *
 * This is the scan's actual weekly domain, not the handful in signal_history: it
 * runs the same `applyScanScreen` the nightly scan and the Suggestions page use,
 * then reduces to distinct companies exactly as the scan does (resolve the focus
 * sector, collapse cross-listings and preferreds). Read with the service-role
 * client because the landing page is public and the universe is behind RLS.
 */
export async function getFocusCompanyCount(): Promise<number> {
  const admin = createAdminClient();

  const { data: mapRows } = await admin
    .from('sector_mapping')
    .select('symbol,sector,industry,focus_sector,specificity,is_excluded,is_payment_processor')
    .returns<
      Array<{
        symbol: string | null;
        sector: string | null;
        industry: string | null;
        focus_sector: FocusSector;
        specificity: number;
        is_excluded: boolean;
        is_payment_processor: boolean;
      }>
    >();
  const rules: SectorRule[] = (mapRows ?? []).length
    ? (mapRows ?? []).map((r) => ({
        symbol: r.symbol ?? undefined,
        sector: r.sector ?? undefined,
        industry: r.industry ?? undefined,
        focusSector: r.focus_sector,
        specificity: r.specificity,
        isExcluded: r.is_excluded,
        isPaymentProcessor: r.is_payment_processor,
      }))
    : DEFAULT_SECTOR_RULES;

  const { data: domain } = await applyScanScreen(
    admin.from('universe').select('symbol,name,sector,industry,exchange,country,currency'),
    rules,
  ).returns<
    Array<{
      symbol: string;
      name: string | null;
      sector: string | null;
      industry: string | null;
      exchange: string | null;
      country: string | null;
      currency: string | null;
    }>
  >();

  const eligible = (domain ?? []).filter(
    (r) =>
      resolveFocusSector(rules, { symbol: r.symbol, sector: r.sector, industry: r.industry })
        .focusSector !== 'outside_focus',
  );
  return keepDistinctCompanies(eligible).length;
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
