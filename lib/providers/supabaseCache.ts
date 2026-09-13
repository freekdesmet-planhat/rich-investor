/**
 * Supabase-backed BundleCache.
 *
 * Every fetched bundle is written to `daily_snapshots` keyed by (symbol, as_of).
 * On a provider outage the service reads the newest row back, which is what lets
 * the UI keep rendering the last good snapshot behind a "data from [date]"
 * banner (section 1).
 *
 * Takes a SupabaseClient rather than creating one, so scripts can pass a
 * service-role client and route handlers can pass their own.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BundleCache, SymbolBundle } from './marketData';

interface SnapshotRow {
  symbol: string;
  as_of: string;
  price: number | null;
  currency: string | null;
  market_cap_usd: number | null;
  shares_outstanding: number | null;
  quote: SymbolBundle['quote'];
  income_annual: SymbolBundle['statements']['income']['annual'];
  income_quarterly: SymbolBundle['statements']['income']['quarterly'];
  balance_annual: SymbolBundle['statements']['balance']['annual'];
  balance_quarterly: SymbolBundle['statements']['balance']['quarterly'];
  cash_annual: SymbolBundle['statements']['cash']['annual'];
  cash_quarterly: SymbolBundle['statements']['cash']['quarterly'];
  estimates: SymbolBundle['estimates'];
  price_history: SymbolBundle['priceHistory'];
  filing_currency: string | null;
  statement_sources: SymbolBundle['statementSources'];
  provider: string;
  is_stale: boolean;
  fetch_errors: string[];
}

const NO_SOURCES: SymbolBundle['statementSources'] = {
  income: null,
  balance: null,
  cash: null,
};

export function createSupabaseCache(
  client: SupabaseClient,
  providerName = 'finance-query',
): BundleCache {
  return {
    async read(symbol: string): Promise<SymbolBundle | null> {
      const { data, error } = await client
        .from('daily_snapshots')
        .select('*')
        .eq('symbol', symbol)
        .order('as_of', { ascending: false })
        .limit(1)
        .maybeSingle<SnapshotRow>();

      if (error || !data) return null;

      return {
        symbol: data.symbol,
        asOf: data.as_of,
        quote: data.quote ?? null,
        statements: {
          income: { annual: data.income_annual, quarterly: data.income_quarterly },
          balance: { annual: data.balance_annual, quarterly: data.balance_quarterly },
          cash: { annual: data.cash_annual, quarterly: data.cash_quarterly },
        },
        priceHistory: data.price_history ?? [],
        estimates: data.estimates ?? null,
        filingCurrency: data.filing_currency ?? null,
        statementSources: data.statement_sources ?? NO_SOURCES,
        isStale: false,
        staleAsOf: null,
        errors: [],
      };
    },

    async write(bundle: SymbolBundle): Promise<void> {
      // A stale bundle is a replay of an older snapshot; re-writing it under
      // today's date would erase the evidence that the fetch failed.
      if (bundle.isStale) return;

      const sharesOutstanding =
        bundle.statements.balance.annual?.periods[0]?.metrics.sharesOutstanding ?? null;

      const row: SnapshotRow = {
        symbol: bundle.symbol,
        as_of: bundle.asOf,
        price: bundle.quote?.price ?? null,
        currency: bundle.quote?.currency ?? null,
        market_cap_usd: bundle.quote?.marketCap ?? null,
        shares_outstanding: sharesOutstanding,
        quote: bundle.quote,
        income_annual: bundle.statements.income.annual,
        income_quarterly: bundle.statements.income.quarterly,
        balance_annual: bundle.statements.balance.annual,
        balance_quarterly: bundle.statements.balance.quarterly,
        cash_annual: bundle.statements.cash.annual,
        cash_quarterly: bundle.statements.cash.quarterly,
        estimates: bundle.estimates,
        price_history: bundle.priceHistory,
        filing_currency: bundle.filingCurrency,
        statement_sources: bundle.statementSources,
        provider: providerName,
        is_stale: false,
        fetch_errors: bundle.errors,
      };

      const { error } = await client
        .from('daily_snapshots')
        .upsert(row, { onConflict: 'symbol,as_of' });

      if (error) throw new Error(`daily_snapshots upsert failed: ${error.message}`);
    },
  };
}
