/**
 * The canonical market-data model.
 *
 * Nothing outside lib/providers/ may depend on a provider's own field names or
 * response shape. Providers normalise into the types below, so finance-query
 * can later be swapped for yahoo-finance2 or Financial Modeling Prep without
 * touching the ratio engine, the signal logic or the UI (section 1).
 */

export type StatementKind = 'income' | 'balance' | 'cash';
export type StatementFrequency = 'annual' | 'quarterly';
export type HistoryRange = '1y' | '5y' | '10y' | 'max';

/**
 * Canonical metric names.
 *
 * Providers map their own vocabulary onto these keys. A metric that a provider
 * cannot supply is simply absent — never zero, so the ratio engine can tell
 * "missing" apart from "genuinely nil".
 */
export const INCOME_METRICS = [
  'revenue',
  'costOfRevenue',
  'grossProfit',
  'operatingIncome',
  'ebit',
  'ebitda',
  'netIncome',
  'pretaxIncome',
  'taxProvision',
  'researchAndDevelopment',
  'sellingGeneralAdmin',
  'totalExpenses',
  'operatingExpenses',
  'interestExpense',
  'interestIncome',
  'basicEps',
  'dilutedEps',
  'basicShares',
  'dilutedShares',
] as const;

export const BALANCE_METRICS = [
  'totalAssets',
  'totalLiabilities',
  'stockholdersEquity',
  'cash',
  'cashAndShortTermInvestments',
  'totalDebt',
  'netDebt',
  'currentAssets',
  'currentLiabilities',
  'inventory',
  'receivables',
  'accountsPayable',
  'goodwill',
  'retainedEarnings',
  'workingCapital',
  'tangibleBookValue',
  'investedCapital',
  'netPPE',
  'sharesOutstanding',
  /**
   * Cash a company holds but cannot deploy — for payment processors this is
   * the settlement float owed to merchants. Reported explicitly by some
   * (Visa), buried in cash by others (Adyen, PayPal).
   */
  'restrictedCash',
] as const;

export const CASH_METRICS = [
  'operatingCashFlow',
  'investingCashFlow',
  'financingCashFlow',
  'capitalExpenditure',
  'freeCashFlow',
  'dividendsPaid',
  'repurchaseOfStock',
  'stockBasedCompensation',
  'depreciationAndAmortization',
  'changeInInventory',
  'changeInReceivables',
] as const;

export type IncomeMetric = (typeof INCOME_METRICS)[number];
export type BalanceMetric = (typeof BALANCE_METRICS)[number];
export type CashMetric = (typeof CASH_METRICS)[number];
export type MetricName = IncomeMetric | BalanceMetric | CashMetric;

/** One fiscal period of one statement. */
export interface StatementPeriod {
  /** Period end date, ISO `YYYY-MM-DD`. */
  endDate: string;
  /** Canonical metric name -> value, in the filing currency. */
  metrics: Partial<Record<MetricName, number>>;
}

export interface FinancialStatement {
  symbol: string;
  kind: StatementKind;
  frequency: StatementFrequency;
  /** Newest period first. */
  periods: StatementPeriod[];
  /** Filing currency when the provider reports one. */
  currency?: string;
}

export interface Quote {
  symbol: string;
  name: string | null;
  /** Last regular-session price, in `currency`. */
  price: number | null;
  currency: string | null;
  /** Market capitalisation in `currency` (not converted to USD here). */
  marketCap: number | null;
  previousClose: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  exchange: string | null;
  /** The provider's own sector/industry labels, mapped to focus sectors later. */
  sector: string | null;
  industry: string | null;
  /** ISO date of the next expected earnings report, when known. */
  nextEarningsDate: string | null;
  beta: number | null;
  /** Trailing annual dividend per share. */
  dividendPerShare: number | null;
  employees: number | null;
  description: string | null;
}

export interface PricePoint {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string | null;
  /** ISO timestamp; null when the provider only gives a relative time. */
  publishedAt: string | null;
  imageUrl: string | null;
  sentiment: { label: string; score: number; confidence: number } | null;
}

export interface SearchResult {
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  quoteType: string | null;
}

/**
 * Forward-looking analyst figures.
 *
 * finance-query does not expose these; its implementation returns null and the
 * ratio engine falls back to historical growth alone. The shape is part of the
 * interface so a provider that does supply estimates needs no changes elsewhere.
 */
export interface EstimatePoint {
  /** Fiscal period end, ISO `YYYY-MM-DD`. */
  fiscalYearEnd: string;
  eps: number | null;
  revenue: number | null;
  analystCount: number | null;
}

export interface AnalystEstimates {
  symbol: string;
  /** Consensus EPS for the next fiscal year. */
  nextYearEps: number | null;
  /**
   * Consensus EPS growth implied by two consecutive estimate years.
   *
   * The growth the book's forward PEG wants is measured from *actual* trailing
   * EPS to next year's estimate, which needs a figure this provider does not
   * hold; the ratio engine computes that itself and uses this only as a
   * fallback when trailing EPS is unusable.
   */
  nextYearEpsGrowth: number | null;
  nextYearRevenueGrowth: number | null;
  analystCount: number | null;
  targetPrice: number | null;
  /** Full consensus series, nearest fiscal year first. */
  series: EstimatePoint[];
}

/**
 * A source of historical statements only.
 *
 * Kept separate from MarketDataProvider so a deep-history source (SEC EDGAR)
 * can be layered over a quote source (finance-query) without having to
 * implement prices, news or search.
 */
export interface FundamentalsProvider {
  readonly name: string;
  /** True when this source can serve the symbol at all (e.g. it has a CIK). */
  covers(symbol: string): Promise<boolean>;
  getStatements(
    symbols: string[],
    kind: StatementKind,
    frequency: StatementFrequency,
  ): Promise<Map<string, FinancialStatement>>;
}

/**
 * Every provider implements this. Batch methods take many symbols and return a
 * Map keyed by symbol; a symbol the provider had no data for is absent from the
 * Map rather than present-but-empty, so callers must handle misses explicitly.
 */
export interface MarketDataProvider {
  readonly name: string;

  getQuotes(symbols: string[]): Promise<Map<string, Quote>>;

  getStatements(
    symbols: string[],
    kind: StatementKind,
    frequency: StatementFrequency,
  ): Promise<Map<string, FinancialStatement>>;

  getPriceHistory(symbol: string, range: HistoryRange): Promise<PricePoint[]>;

  getNews(symbol: string, limit?: number): Promise<NewsItem[]>;

  search(query: string, limit?: number): Promise<SearchResult[]>;

  /** Returns null when the provider has no forward estimates. */
  getAnalystEstimates(symbol: string): Promise<AnalystEstimates | null>;
}

/** Raised when a provider call fails after its retries are exhausted. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
