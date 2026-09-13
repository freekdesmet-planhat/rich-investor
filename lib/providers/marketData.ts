/**
 * The market-data service the rest of the app talks to.
 *
 * Responsibilities:
 *   * pick the provider (finance-query today, swappable via MARKET_DATA_PROVIDER)
 *   * assemble everything one ticker needs into a single SymbolBundle
 *   * cache each bundle in Supabase and fall back to the newest cached snapshot
 *     when the source is unavailable, so the app keeps working on the last
 *     snapshot and can show the "data from [date]" banner (section 1)
 *
 * The cache is injected rather than imported, so this layer runs standalone
 * (scripts, tests) without Supabase configured.
 */
import { financeQueryProvider } from './financeQuery';
import {
  type AnalystEstimates,
  type FinancialStatement,
  type HistoryRange,
  type MarketDataProvider,
  type NewsItem,
  type PricePoint,
  type Quote,
  type StatementFrequency,
  type StatementKind,
} from './types';

export interface SymbolBundle {
  symbol: string;
  /** The date this bundle describes, ISO `YYYY-MM-DD`. */
  asOf: string;
  quote: Quote | null;
  statements: {
    income: { annual: FinancialStatement | null; quarterly: FinancialStatement | null };
    balance: { annual: FinancialStatement | null; quarterly: FinancialStatement | null };
    cash: { annual: FinancialStatement | null; quarterly: FinancialStatement | null };
  };
  priceHistory: PricePoint[];
  estimates: AnalystEstimates | null;
  /** True when any part of this bundle came from an older cached snapshot. */
  isStale: boolean;
  /** The snapshot date actually used, when isStale. Drives the UI banner. */
  staleAsOf: string | null;
  /** Human-readable notes about what could not be fetched. */
  errors: string[];
}

/** What the service needs from a cache; Supabase implements this. */
export interface BundleCache {
  read(symbol: string): Promise<SymbolBundle | null>;
  write(bundle: SymbolBundle): Promise<void>;
}

export const nullCache: BundleCache = {
  async read() {
    return null;
  },
  async write() {},
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const KINDS: StatementKind[] = ['income', 'balance', 'cash'];
const FREQUENCIES: StatementFrequency[] = ['annual', 'quarterly'];

export interface MarketDataService {
  readonly providerName: string;
  getBundles(symbols: string[], range?: HistoryRange): Promise<Map<string, SymbolBundle>>;
  getBundle(symbol: string, range?: HistoryRange): Promise<SymbolBundle>;
  getNews(symbol: string, limit?: number): Promise<NewsItem[]>;
  search(query: string, limit?: number): ReturnType<MarketDataProvider['search']>;
}

export function createMarketDataService(
  provider: MarketDataProvider = financeQueryProvider,
  cache: BundleCache = nullCache,
): MarketDataService {
  /**
   * Fetches every statement kind/frequency for the whole symbol list. Each of
   * the six combinations is one batched provider call, so a 27-ticker refresh
   * costs six statement calls rather than 162.
   */
  async function fetchStatements(symbols: string[]) {
    const results = new Map<string, Map<string, FinancialStatement>>();
    const errors: string[] = [];

    await Promise.all(
      KINDS.flatMap((kind) =>
        FREQUENCIES.map(async (frequency) => {
          const key = `${kind}:${frequency}`;
          try {
            results.set(key, await provider.getStatements(symbols, kind, frequency));
          } catch (error) {
            results.set(key, new Map());
            errors.push(`${key}: ${(error as Error).message}`);
          }
        }),
      ),
    );

    return { results, errors };
  }

  async function getBundles(
    symbols: string[],
    range: HistoryRange = '5y',
  ): Promise<Map<string, SymbolBundle>> {
    const asOf = today();
    const out = new Map<string, SymbolBundle>();
    if (symbols.length === 0) return out;

    const sharedErrors: string[] = [];

    let quotes = new Map<string, Quote>();
    try {
      quotes = await provider.getQuotes(symbols);
    } catch (error) {
      sharedErrors.push(`quotes: ${(error as Error).message}`);
    }

    const { results: statements, errors: statementErrors } = await fetchStatements(symbols);
    sharedErrors.push(...statementErrors);

    // Price history is per-symbol only; run it concurrently but bounded.
    const histories = new Map<string, PricePoint[]>();
    const historyErrors = new Map<string, string>();
    await mapWithConcurrency(symbols, 5, async (symbol) => {
      try {
        histories.set(symbol, await provider.getPriceHistory(symbol, range));
      } catch (error) {
        historyErrors.set(symbol, (error as Error).message);
      }
    });

    for (const symbol of symbols) {
      const errors = [...sharedErrors];
      const historyError = historyErrors.get(symbol);
      if (historyError) errors.push(`priceHistory: ${historyError}`);

      const pick = (kind: StatementKind, frequency: StatementFrequency) =>
        statements.get(`${kind}:${frequency}`)?.get(symbol) ?? null;

      const bundle: SymbolBundle = {
        symbol,
        asOf,
        quote: quotes.get(symbol) ?? null,
        statements: {
          income: { annual: pick('income', 'annual'), quarterly: pick('income', 'quarterly') },
          balance: { annual: pick('balance', 'annual'), quarterly: pick('balance', 'quarterly') },
          cash: { annual: pick('cash', 'annual'), quarterly: pick('cash', 'quarterly') },
        },
        priceHistory: histories.get(symbol) ?? [],
        estimates: await provider.getAnalystEstimates(symbol).catch(() => null),
        isStale: false,
        staleAsOf: null,
        errors,
      };

      // A bundle with no price and no annual income statement is not usable;
      // fall back to the newest cached snapshot and flag it as stale.
      const usable = bundle.quote?.price != null && bundle.statements.income.annual != null;
      if (!usable) {
        const cached = await cache.read(symbol);
        if (cached) {
          out.set(symbol, {
            ...cached,
            isStale: true,
            staleAsOf: cached.asOf,
            errors: [...errors, `fell back to cached snapshot from ${cached.asOf}`],
          });
          continue;
        }
      }

      await cache.write(bundle).catch((error) => {
        bundle.errors.push(`cache write: ${(error as Error).message}`);
      });
      out.set(symbol, bundle);
    }

    return out;
  }

  return {
    providerName: provider.name,

    getBundles,

    async getBundle(symbol: string, range: HistoryRange = '5y') {
      const bundles = await getBundles([symbol], range);
      const bundle = bundles.get(symbol);
      if (bundle) return bundle;
      throw new Error(`No data available for ${symbol}`);
    },

    getNews: (symbol, limit) => provider.getNews(symbol, limit),
    search: (query, limit) => provider.search(query, limit),
  };
}

/** Runs `worker` over `items` with at most `limit` in flight. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

export { financeQueryProvider };
export * from './types';
