/**
 * Server-side reads for the UI.
 *
 * These run in server components only. Until magic-link sign-in exists, they
 * use the service-role client: `signal_history`, `ratios` and `daily_snapshots`
 * grant SELECT to `authenticated`, and an unauthenticated browser is `anon`, so
 * reading straight from the client would return nothing. The key never reaches
 * the browser, and once auth lands these swap to the user's own client without
 * the call sites changing.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RatioColor, RatioKey } from '@/lib/ratios/engine';
import type { FocusSector } from '@/lib/sectors/mapping';
import type { Lang } from '@/lib/i18n/config';

export interface SignalRow {
  symbol: string;
  as_of: string;
  status: 'buy_worthy' | 'almost' | 'watching';
  lynch_category: string;
  focus_sector: FocusSector;
  conditions_met: number;
  conditions_applicable: number;
  peg_basis: string | null;
  checklist: Array<{
    key: string;
    applicable: boolean;
    passed: boolean;
    value: number | null;
    target: string;
    notApplicableReason?: string;
    detail: Record<string, unknown>;
  }>;
  why_en: string;
  why_nl: string;
  became_buy_worthy: boolean;
  previous_status: string | null;
}

export interface RatioRow {
  symbol: string;
  as_of: string;
  ratio_key: RatioKey;
  value: number | null;
  unit: 'ratio' | 'percent' | 'currency' | 'years';
  color: RatioColor;
  target_label: string;
  target_source: 'book' | 'app_default';
  currency: string | null;
  history: Array<{ period: string; value: number }>;
  not_applicable: boolean;
  unavailable_reason: string | null;
  detail: Record<string, unknown>;
  is_adjusted: boolean;
  raw_value: number | null;
}

export interface SnapshotRow {
  symbol: string;
  as_of: string;
  price: number | null;
  currency: string | null;
  market_cap_usd: number | null;
  quote: {
    name?: string | null;
    sector?: string | null;
    industry?: string | null;
    nextEarningsDate?: string | null;
    description?: string | null;
  } | null;
  price_history: Array<{ date: string; close: number }> | null;
  estimates: {
    nextYearEps: number | null;
    nextYearEpsGrowth: number | null;
    analystCount: number | null;
    targetPrice: number | null;
    series: Array<{ fiscalYearEnd: string; eps: number | null; analystCount: number | null }>;
  } | null;
  filing_currency: string | null;
  statement_sources: Record<string, string | null> | null;
  estimates_source: string | null;
  is_stale: boolean;
  fetch_errors: string[] | null;
}

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** The most recent signal per symbol. */
export async function getLatestSignals(): Promise<SignalRow[]> {
  const { data, error } = await client()
    .from('signal_history')
    .select('*')
    .order('as_of', { ascending: false })
    .returns<SignalRow[]>();

  if (error) throw new Error(error.message);

  const newest = new Map<string, SignalRow>();
  for (const row of data ?? []) if (!newest.has(row.symbol)) newest.set(row.symbol, row);

  // Buy-worthy first, then by how close the rest are.
  const rank = { buy_worthy: 0, almost: 1, watching: 2 } as const;
  return [...newest.values()].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      b.conditions_met / b.conditions_applicable -
        a.conditions_met / a.conditions_applicable ||
      a.symbol.localeCompare(b.symbol),
  );
}

export async function getSignal(symbol: string): Promise<SignalRow | null> {
  const { data } = await client()
    .from('signal_history')
    .select('*')
    .eq('symbol', symbol)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle<SignalRow>();
  return data ?? null;
}

export async function getRatios(symbol: string, asOf: string): Promise<RatioRow[]> {
  const { data } = await client()
    .from('ratios')
    .select('*')
    .eq('symbol', symbol)
    .eq('as_of', asOf)
    .returns<RatioRow[]>();
  return data ?? [];
}

export async function getSnapshot(symbol: string): Promise<SnapshotRow | null> {
  const { data } = await client()
    .from('daily_snapshots')
    .select(
      'symbol,as_of,price,currency,market_cap_usd,quote,price_history,estimates,' +
        'filing_currency,statement_sources,estimates_source,is_stale,fetch_errors',
    )
    .eq('symbol', symbol)
    .order('as_of', { ascending: false })
    .limit(1)
    .maybeSingle<SnapshotRow>();
  return data ?? null;
}

export async function getCompanyNames(symbols: string[]): Promise<Map<string, string>> {
  if (symbols.length === 0) return new Map();
  const { data } = await client()
    .from('universe')
    .select('symbol,name')
    .in('symbol', symbols)
    .returns<Array<{ symbol: string; name: string | null }>>();
  return new Map((data ?? []).filter((r) => r.name).map((r) => [r.symbol, r.name as string]));
}

export interface Translation {
  name: string;
  target: string;
  explanation: string;
}

/**
 * Tooltip copy for one language, keyed `${namespace}:${key}`.
 *
 * Seeded from docs/ratios.<lang>.md, which stays the source of truth.
 */
export async function getTranslations(lang: Lang): Promise<Map<string, Translation>> {
  const { data } = await client()
    .from('translations')
    .select('namespace,key,field,value')
    .eq('lang', lang)
    .returns<Array<{ namespace: string; key: string; field: string; value: string }>>();

  const out = new Map<string, Translation>();
  for (const row of data ?? []) {
    const id = `${row.namespace}:${row.key}`;
    const entry = out.get(id) ?? { name: '', target: '', explanation: '' };
    if (row.field === 'name') entry.name = row.value;
    if (row.field === 'target') entry.target = row.value;
    if (row.field === 'explanation') entry.explanation = row.value;
    out.set(id, entry);
  }
  return out;
}
