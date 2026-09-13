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
import { fmpEstimatesProvider } from './fmpEstimates';
import { secEdgarProvider } from './secEdgar';
import {
  type AnalystEstimates,
  type FinancialStatement,
  type FundamentalsProvider,
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
  /**
   * The currency the statements are reported in, when a source could establish
   * it. Differs from quote.currency for cross-listed companies (ASML reports in
   * EUR, trades in USD), and the ratio engine must convert before dividing a
   * price by a per-share figure.
   */
  filingCurrency: string | null;
  /** Which source supplied the statements, per kind. */
  statementSources: Record<StatementKind, string | null>;
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

export interface MarketDataOptions {
  /** Quotes, prices, news, search, and statements of last resort. */
  provider?: MarketDataProvider;
  cache?: BundleCache;
  /**
   * Deep-history sources, tried in order before the primary provider.
   *
   * SEC EDGAR leads because it returns the full filing history (the book's
   * rules need 5 years; finance-query returns 4) and states the filing
   * currency outright. Symbols it does not cover — EU-only listings — fall
   * through to the primary provider's shorter history.
   */
  fundamentalsProviders?: FundamentalsProvider[];
  /**
   * Forward estimates. Null for any symbol the source does not cover, which is
   * most of them on FMP's free tier, so callers must handle absence.
   */
  estimatesProvider?: { getAnalystEstimates(symbol: string): Promise<AnalystEstimates | null> };
  /**
   * Skips the estimates call entirely. The universe-wide auto-scan sets this,
   * because FMP's free tier allows ~250 requests/day and the scan covers
   * thousands of tickers.
   */
  skipEstimates?: boolean;
}

export function createMarketDataService(options: MarketDataOptions = {}): MarketDataService {
  const {
    provider = financeQueryProvider,
    cache = nullCache,
    fundamentalsProviders = [secEdgarProvider],
    estimatesProvider = fmpEstimatesProvider,
    skipEstimates = false,
  } = options;
  /**
   * Fetches every statement kind/frequency for the whole symbol list. Each of
   * the six combinations is one batched provider call, so a 27-ticker refresh
   * costs six statement calls rather than 162.
   */
  async function fetchStatements(symbols: string[]) {
    const results = new Map<string, Map<string, FinancialStatement>>();
    const sources = new Map<string, string>();
    const errors: string[] = [];

    // Which symbols each deep-history source can serve.
    const covered = new Map<FundamentalsProvider, string[]>();
    for (const source of fundamentalsProviders) {
      const list: string[] = [];
      for (const symbol of symbols) {
        try {
          if (await source.covers(symbol)) list.push(symbol);
        } catch (error) {
          errors.push(`${source.name} coverage check: ${(error as Error).message}`);
          break;
        }
      }
      covered.set(source, list);
    }

    await Promise.all(
      KINDS.flatMap((kind) =>
        FREQUENCIES.map(async (frequency) => {
          const key = `${kind}:${frequency}`;
          const merged = new Map<string, FinancialStatement>();

          for (const source of fundamentalsProviders) {
            const list = covered.get(source) ?? [];
            if (list.length === 0) continue;
            try {
              for (const [symbol, statement] of await source.getStatements(list, kind, frequency)) {
                if (!merged.has(symbol)) {
                  merged.set(symbol, statement);
                  sources.set(`${key}:${symbol}`, source.name);
                }
              }
            } catch (error) {
              errors.push(`${source.name} ${key}: ${(error as Error).message}`);
            }
          }

          // Whatever the deep-history sources could not supply.
          const remaining = symbols.filter((s) => !merged.has(s));
          if (remaining.length > 0) {
            try {
              for (const [symbol, statement] of await provider.getStatements(
                remaining,
                kind,
                frequency,
              )) {
                merged.set(symbol, statement);
                sources.set(`${key}:${symbol}`, provider.name);
              }
            } catch (error) {
              errors.push(`${provider.name} ${key}: ${(error as Error).message}`);
            }
          }

          results.set(key, merged);
        }),
      ),
    );

    return { results, sources, errors };
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

    const {
      results: statements,
      sources: statementSources,
      errors: statementErrors,
    } = await fetchStatements(symbols);
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

      const income = { annual: pick('income', 'annual'), quarterly: pick('income', 'quarterly') };
      const balance = {
        annual: pick('balance', 'annual'),
        quarterly: pick('balance', 'quarterly'),
      };
      const cash = { annual: pick('cash', 'annual'), quarterly: pick('cash', 'quarterly') };

      // Filing currency comes from whichever statement reported one; EDGAR
      // always does, finance-query never does, in which case we fall back to
      // the quote currency and note the assumption.
      const filingCurrency =
        income.annual?.currency ??
        balance.annual?.currency ??
        cash.annual?.currency ??
        quotes.get(symbol)?.currency ??
        null;

      const bundle: SymbolBundle = {
        symbol,
        asOf,
        quote: quotes.get(symbol) ?? null,
        statements: { income, balance, cash },
        priceHistory: histories.get(symbol) ?? [],
        estimates: skipEstimates
          ? null
          : await estimatesProvider.getAnalystEstimates(symbol).catch(() => null),
        filingCurrency,
        statementSources: {
          income: statementSources.get(`income:annual:${symbol}`) ?? null,
          balance: statementSources.get(`balance:annual:${symbol}`) ?? null,
          cash: statementSources.get(`cash:annual:${symbol}`) ?? null,
        },
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
