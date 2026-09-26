/**
 * finance-query provider (https://finance-query.com), data sourced from Yahoo
 * Finance.
 *
 * The hosted API spreads what we need across two versions:
 *   v2 /quotes      numeric price + market cap (only ~17 of its 172 fields are
 *                   ever populated; every fundamentals field comes back null)
 *   v2 /financials  income / balance / cash, annual and quarterly, batched
 *   v2 /news        news feed
 *   v2 /search      symbol search
 *   v1 /quotes      sector, industry, next earnings date, dividend, beta —
 *                   but as display strings ("4.85T", "0.33%"), so it is used
 *                   only for the fields v2 does not populate
 *   v1 /historical  daily OHLC, the only source of price history
 *
 * Known limits, measured against the seed list rather than assumed:
 *   * Annual statements return 4 fiscal years, never 5.
 *   * Quarterly statements are missing for European listings (.AS/.PA/.SW),
 *     so those have no TTM and fall back to the last full fiscal year.
 *   * No analyst estimates are exposed anywhere.
 *   * Individual statement calls intermittently return an empty array for a
 *     symbol that has data, hence the retry below.
 */
import {
  type AnalystEstimates,
  type FinancialStatement,
  type HistoryRange,
  type MarketDataProvider,
  type MetricName,
  type NewsItem,
  type PricePoint,
  ProviderError,
  type Quote,
  type SearchResult,
  type StatementFrequency,
  type StatementKind,
  type StatementPeriod,
} from './types';

const BASE_URL = process.env.FINANCE_QUERY_BASE_URL ?? 'https://finance-query.com';

/** Symbols per batched request. The API accepts more, but large batches time out. */
const BATCH_SIZE = 7;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Metric mapping: Yahoo's names -> our canonical names
// ---------------------------------------------------------------------------

const INCOME_MAP: Record<string, MetricName> = {
  TotalRevenue: 'revenue',
  OperatingRevenue: 'revenue',
  CostOfRevenue: 'costOfRevenue',
  ReconciledCostOfRevenue: 'costOfRevenue',
  GrossProfit: 'grossProfit',
  OperatingIncome: 'operatingIncome',
  TotalOperatingIncomeAsReported: 'operatingIncome',
  EBIT: 'ebit',
  EBITDA: 'ebitda',
  NormalizedEBITDA: 'ebitda',
  NetIncome: 'netIncome',
  NetIncomeCommonStockholders: 'netIncome',
  PretaxIncome: 'pretaxIncome',
  TaxProvision: 'taxProvision',
  ResearchAndDevelopment: 'researchAndDevelopment',
  SellingGeneralAndAdministration: 'sellingGeneralAdmin',
  TotalExpenses: 'totalExpenses',
  OperatingExpense: 'operatingExpenses',
  InterestExpense: 'interestExpense',
  InterestIncome: 'interestIncome',
  BasicEPS: 'basicEps',
  DilutedEPS: 'dilutedEps',
  BasicAverageShares: 'basicShares',
  DilutedAverageShares: 'dilutedShares',
};

const BALANCE_MAP: Record<string, MetricName> = {
  TotalAssets: 'totalAssets',
  TotalLiabilitiesNetMinorityInterest: 'totalLiabilities',
  StockholdersEquity: 'stockholdersEquity',
  CommonStockEquity: 'stockholdersEquity',
  CashAndCashEquivalents: 'cash',
  CashCashEquivalentsAndShortTermInvestments: 'cashAndShortTermInvestments',
  TotalDebt: 'totalDebt',
  NetDebt: 'netDebt',
  CurrentAssets: 'currentAssets',
  CurrentLiabilities: 'currentLiabilities',
  Inventory: 'inventory',
  Receivables: 'receivables',
  AccountsReceivable: 'receivables',
  AccountsPayable: 'accountsPayable',
  Goodwill: 'goodwill',
  RetainedEarnings: 'retainedEarnings',
  WorkingCapital: 'workingCapital',
  TangibleBookValue: 'tangibleBookValue',
  InvestedCapital: 'investedCapital',
  NetPPE: 'netPPE',
  OrdinarySharesNumber: 'sharesOutstanding',
  ShareIssued: 'sharesOutstanding',
  RestrictedCash: 'restrictedCash',
};

const CASH_MAP: Record<string, MetricName> = {
  OperatingCashFlow: 'operatingCashFlow',
  CashFlowFromContinuingOperatingActivities: 'operatingCashFlow',
  InvestingCashFlow: 'investingCashFlow',
  FinancingCashFlow: 'financingCashFlow',
  CapitalExpenditure: 'capitalExpenditure',
  FreeCashFlow: 'freeCashFlow',
  CashDividendsPaid: 'dividendsPaid',
  CommonStockDividendPaid: 'dividendsPaid',
  RepurchaseOfCapitalStock: 'repurchaseOfStock',
  StockBasedCompensation: 'stockBasedCompensation',
  DepreciationAndAmortization: 'depreciationAndAmortization',
  ChangeInInventory: 'changeInInventory',
  ChangeInReceivables: 'changeInReceivables',
  ChangesInAccountReceivables: 'changeInReceivables',
};

/**
 * Preferred source wins when two Yahoo metrics map to the same canonical name
 * (e.g. NetIncome and NetIncomeCommonStockholders -> netIncome).
 */
const PREFERRED: Record<string, number> = {
  TotalRevenue: 2,
  OperatingRevenue: 1,
  NetIncome: 2,
  NetIncomeCommonStockholders: 1,
  CostOfRevenue: 2,
  ReconciledCostOfRevenue: 1,
  OperatingIncome: 2,
  TotalOperatingIncomeAsReported: 1,
  EBITDA: 2,
  NormalizedEBITDA: 1,
  StockholdersEquity: 2,
  CommonStockEquity: 1,
  Receivables: 2,
  AccountsReceivable: 1,
  OperatingCashFlow: 2,
  CashFlowFromContinuingOperatingActivities: 1,
  OrdinarySharesNumber: 2,
  ShareIssued: 1,
  CashDividendsPaid: 2,
  CommonStockDividendPaid: 1,
  ChangeInReceivables: 2,
  ChangesInAccountReceivables: 1,
};

const STATEMENT_PARAM: Record<StatementKind, string> = {
  income: 'income',
  balance: 'balance',
  cash: 'cash',
};

const METRIC_MAP: Record<StatementKind, Record<string, MetricName>> = {
  income: INCOME_MAP,
  balance: BALANCE_MAP,
  cash: CASH_MAP,
};

// ---------------------------------------------------------------------------
// Raw response shapes
// ---------------------------------------------------------------------------

interface RawFinancials {
  errors?: unknown[];
  financials?: Array<{
    symbol: string;
    statement?: Array<{ metric: string; values?: Array<{ date: string; value: number | null }> }>;
  }>;
}

/** The subset the nightly price pass reads: price, currency, market cap. */
export interface PriceQuote {
  symbol: string;
  price: number | null;
  currency: string | null;
  marketCap: number | null;
}

interface RawV2Quote {
  symbol: string;
  shortName?: string | null;
  longName?: string | null;
  currency?: string | null;
  marketCap?: number | null;
  exchangeName?: string | null;
  exchange?: string | null;
  regularMarketPrice?: number | null;
  regularMarketPreviousClose?: number | null;
  regularMarketOpen?: number | null;
  regularMarketDayHigh?: number | null;
  regularMarketDayLow?: number | null;
  regularMarketVolume?: number | null;
}

interface RawV1Quote {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  industry?: string | null;
  earningsDate?: string | null;
  beta?: string | null;
  dividend?: string | null;
  employees?: string | null;
  about?: string | null;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson<T>(path: string, attempt = 1): Promise<T> {
  const url = `${BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });

    // 429 and 5xx are worth retrying; other 4xx are a bug in our request.
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.ok) {
      throw new ProviderError(
        `finance-query ${response.status} for ${path}: ${await response.text()}`,
        'finance-query',
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (attempt >= MAX_RETRIES) {
      throw new ProviderError(
        `finance-query request failed after ${MAX_RETRIES} attempts: ${path}`,
        'finance-query',
        error,
      );
    }
    await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    return getJson<T>(path, attempt + 1);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Parses the display strings v1 returns ("4.85T", "0.33%", "1.09"). */
function parseLoose(value: string | null | undefined): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/[,%$€£\s+]/g, '');
  const match = /^(-?\d*\.?\d+)([TBMK])?$/i.exec(cleaned);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const scale = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[match[2]?.toUpperCase() ?? ''] ?? 1;
  return n * scale;
}

/** "Oct 29, 2026" -> "2026-10-29". */
function parseDateLoose(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class FinanceQueryProvider implements MarketDataProvider {
  readonly name = 'finance-query';

  async getQuotes(symbols: string[]): Promise<Map<string, Quote>> {
    if (symbols.length === 0) return new Map();

    // v2 carries the numbers, v1 carries sector/industry/earnings date.
    const [v2, v1] = await Promise.all([
      this.fetchV2Quotes(symbols),
      this.fetchV1Quotes(symbols).catch(() => new Map<string, RawV1Quote>()),
    ]);

    const out = new Map<string, Quote>();
    for (const symbol of symbols) {
      const a = v2.get(symbol);
      const b = v1.get(symbol);
      if (!a && !b) continue;

      out.set(symbol, {
        symbol,
        name: a?.longName ?? a?.shortName ?? b?.name ?? null,
        price: a?.regularMarketPrice ?? null,
        currency: a?.currency ?? null,
        marketCap: a?.marketCap ?? null,
        previousClose: a?.regularMarketPreviousClose ?? null,
        open: a?.regularMarketOpen ?? null,
        dayHigh: a?.regularMarketDayHigh ?? null,
        dayLow: a?.regularMarketDayLow ?? null,
        volume: a?.regularMarketVolume ?? null,
        exchange: a?.exchangeName ?? a?.exchange ?? null,
        sector: b?.sector ?? null,
        industry: b?.industry ?? null,
        nextEarningsDate: parseDateLoose(b?.earningsDate),
        beta: parseLoose(b?.beta),
        dividendPerShare: parseLoose(b?.dividend),
        employees: parseLoose(b?.employees),
        description: b?.about ?? null,
      });
    }
    return out;
  }

  /**
   * One v2 request for price and market cap only — the nightly price pass.
   *
   * The full `getQuotes` fetches v1 as well (sector, earnings date, beta) and
   * chunks at seven; the price pass needs neither, so it takes the v2 numbers in
   * a single larger request and controls its own batch size. Kept as its own
   * method so the price pass can write market caps and detect throttling one
   * batch at a time — a partial run then keeps whatever it fetched.
   */
  async fetchPriceBatch(symbols: string[]): Promise<PriceQuote[]> {
    if (symbols.length === 0) return [];
    const data = await getJson<{ quotes?: RawV2Quote[] }>(
      `/v2/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`,
    );
    return (data.quotes ?? [])
      .filter((q): q is RawV2Quote => Boolean(q?.symbol))
      .map((q) => ({
        symbol: q.symbol,
        price: q.regularMarketPrice ?? null,
        currency: q.currency ?? null,
        marketCap: q.marketCap ?? null,
      }));
  }

  private async fetchV2Quotes(symbols: string[]): Promise<Map<string, RawV2Quote>> {
    const out = new Map<string, RawV2Quote>();
    for (const batch of chunk(symbols, BATCH_SIZE)) {
      const data = await getJson<{ quotes?: RawV2Quote[] }>(
        `/v2/quotes?symbols=${batch.map(encodeURIComponent).join(',')}`,
      );
      for (const q of data.quotes ?? []) if (q?.symbol) out.set(q.symbol, q);
    }
    return out;
  }

  private async fetchV1Quotes(symbols: string[]): Promise<Map<string, RawV1Quote>> {
    const out = new Map<string, RawV1Quote>();
    for (const batch of chunk(symbols, BATCH_SIZE)) {
      const data = await getJson<RawV1Quote[] | { quotes?: RawV1Quote[] }>(
        `/v1/quotes?symbols=${batch.map(encodeURIComponent).join(',')}`,
      );
      const list = Array.isArray(data) ? data : (data.quotes ?? []);
      for (const q of list) if (q?.symbol) out.set(q.symbol, q);
    }
    return out;
  }

  async getStatements(
    symbols: string[],
    kind: StatementKind,
    frequency: StatementFrequency,
  ): Promise<Map<string, FinancialStatement>> {
    if (symbols.length === 0) return new Map();

    const out = new Map<string, FinancialStatement>();
    const map = METRIC_MAP[kind];

    for (const batch of chunk(symbols, BATCH_SIZE)) {
      const query =
        `/v2/financials?symbols=${batch.map(encodeURIComponent).join(',')}` +
        `&statement=${STATEMENT_PARAM[kind]}&frequency=${frequency}`;

      let data = await getJson<RawFinancials>(query);

      // The API intermittently answers with an empty array for symbols that do
      // have data. One retry is enough in practice; a genuinely unavailable
      // statement (European quarterlies) stays empty and is reported as a miss.
      if ((data.financials ?? []).length < batch.length) {
        await sleep(RETRY_BASE_MS);
        const retry = await getJson<RawFinancials>(query);
        if ((retry.financials ?? []).length > (data.financials ?? []).length) data = retry;
      }

      for (const entry of data.financials ?? []) {
        if (!entry?.symbol) continue;
        const periods = normalisePeriods(entry.statement ?? [], map);
        if (periods.length === 0) continue;
        out.set(entry.symbol, { symbol: entry.symbol, kind, frequency, periods });
      }
    }
    return out;
  }

  async getPriceHistory(symbol: string, range: HistoryRange): Promise<PricePoint[]> {
    const data = await getJson<
      Record<
        string,
        { open: number; high: number; low: number; close: number; adjClose: number; volume: number }
      >
    >(`/v1/historical?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`);

    return Object.entries(data ?? {})
      .filter(([date, p]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && p && Number.isFinite(p.close))
      .map(([date, p]) => ({
        date,
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
        adjClose: p.adjClose ?? p.close,
        volume: p.volume,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getNews(symbol: string, limit = 20): Promise<NewsItem[]> {
    const data = await getJson<
      Array<{
        title?: string;
        link?: string;
        source?: string;
        time?: string;
        img?: string;
        sentiment?: { label: string; score: number; confidence: number };
      }>
    >(`/v1/news?symbol=${encodeURIComponent(symbol)}`);

    return (Array.isArray(data) ? data : [])
      .filter((n) => n?.title && n?.link)
      .slice(0, limit)
      .map((n) => ({
        title: n.title!,
        url: n.link!,
        source: n.source ?? null,
        // The feed gives relative times ("3 minutes ago"); the caller stamps
        // fetched_at, so an unparseable time stays null rather than guessed.
        publishedAt: null,
        imageUrl: n.img && n.img.startsWith('http') ? n.img : null,
        sentiment: n.sentiment ?? null,
      }));
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const data = await getJson<{
      quotes?: Array<{
        symbol?: string;
        longName?: string | null;
        shortName?: string | null;
        exchDisp?: string | null;
        sector?: string | null;
        industry?: string | null;
        quoteType?: string | null;
      }>;
    }>(`/v2/search?q=${encodeURIComponent(query)}`);

    return (data.quotes ?? [])
      .filter((q) => q?.symbol)
      .slice(0, limit)
      .map((q) => ({
        symbol: q.symbol!,
        name: q.longName ?? q.shortName ?? null,
        exchange: q.exchDisp ?? null,
        sector: q.sector ?? null,
        industry: q.industry ?? null,
        quoteType: q.quoteType ?? null,
      }));
  }

  /**
   * finance-query exposes no forward estimates: /v2/quotes returns null for
   * every earningsTrend/forwardEps field and /v2/recommendations is a
   * similar-stocks list, not analyst figures.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- interface shape
  async getAnalystEstimates(_symbol: string): Promise<AnalystEstimates | null> {
    return null;
  }
}

/**
 * Turns the provider's metric-major shape
 *   [{ metric, values: [{ date, value }] }]
 * into our period-major shape, newest period first.
 */
function normalisePeriods(
  statement: Array<{ metric: string; values?: Array<{ date: string; value: number | null }> }>,
  map: Record<string, MetricName>,
): StatementPeriod[] {
  const byDate = new Map<string, Partial<Record<MetricName, number>>>();
  // Tracks which raw metric supplied each canonical value, so a preferred
  // source is never overwritten by a fallback that happens to come later.
  const source = new Map<string, string>();

  for (const row of statement) {
    const canonical = map[row.metric];
    if (!canonical) continue;

    for (const point of row.values ?? []) {
      if (!point?.date || point.value == null || !Number.isFinite(point.value)) continue;

      const metrics = byDate.get(point.date) ?? {};
      const key = `${point.date}:${canonical}`;
      const incoming = PREFERRED[row.metric] ?? 0;
      const existing = source.get(key);

      if (existing !== undefined && (PREFERRED[existing] ?? 0) >= incoming) continue;

      metrics[canonical] = point.value;
      source.set(key, row.metric);
      byDate.set(point.date, metrics);
    }
  }

  return [...byDate.entries()]
    .map(([endDate, metrics]) => ({ endDate, metrics }))
    .sort((a, b) => b.endDate.localeCompare(a.endDate));
}

export const financeQueryProvider = new FinanceQueryProvider();
