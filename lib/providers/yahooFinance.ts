/**
 * yahoo-finance2 provider — fundamentals, analyst estimates and filing currency.
 *
 * This is the fallback behind both of the narrower sources:
 *
 *   estimates     FMP's free tier refuses most symbols (12 of the 27 seed
 *                 tickers, including every EU listing). yahoo-finance2's
 *                 earningsTrend covers all of them, with analyst counts and a
 *                 consensus growth rate.
 *   statements    SEC EDGAR covers SEC filers only. For the EU-only listings
 *                 this returns 5 annual years against finance-query's 4, and —
 *                 unlike EDGAR — its quarterly data includes Q4.
 *
 * It also reports `financialCurrency`, which settles the filing currency for
 * non-SEC filers: Richemont (CFR.SW) trades in CHF and reports in EUR.
 *
 * Note on the API: quoteSummary's incomeStatementHistory / balanceSheetHistory
 * / cashflowStatementHistory submodules have returned almost nothing since
 * November 2024 and the library itself warns against them, so statements come
 * from fundamentalsTimeSeries instead. earningsTrend is still served by
 * quoteSummary and is unaffected.
 */
import YahooFinance from 'yahoo-finance2';
import {
  type AnalystEstimates,
  type EstimatePoint,
  type FinancialStatement,
  type FundamentalsProvider,
  type MetricName,
  type StatementFrequency,
  type StatementKind,
  type StatementPeriod,
} from './types';

/** Earliest period to request; the book only ever looks back 5 years. */
const PERIOD_START = '2015-01-01';

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
  validation: { logErrors: false, logOptionsErrors: false },
});

type TimeSeriesModule = 'financials' | 'balance-sheet' | 'cash-flow';

const MODULE_BY_KIND: Record<StatementKind, TimeSeriesModule> = {
  income: 'financials',
  balance: 'balance-sheet',
  cash: 'cash-flow',
};

/**
 * Yahoo's camelCase field names per canonical metric, in priority order.
 * The first name present on a period wins.
 */
const FIELDS: Record<StatementKind, Partial<Record<MetricName, string[]>>> = {
  income: {
    revenue: ['totalRevenue', 'operatingRevenue'],
    costOfRevenue: ['costOfRevenue', 'reconciledCostOfRevenue'],
    grossProfit: ['grossProfit'],
    operatingIncome: ['operatingIncome', 'totalOperatingIncomeAsReported'],
    ebit: ['EBIT'],
    ebitda: ['EBITDA', 'normalizedEBITDA'],
    netIncome: ['netIncome', 'netIncomeCommonStockholders'],
    pretaxIncome: ['pretaxIncome'],
    taxProvision: ['taxProvision'],
    researchAndDevelopment: ['researchAndDevelopment'],
    sellingGeneralAdmin: ['sellingGeneralAndAdministration'],
    totalExpenses: ['totalExpenses'],
    interestExpense: ['interestExpense', 'interestExpenseNonOperating'],
    interestIncome: ['interestIncome', 'interestIncomeNonOperating'],
    basicEps: ['basicEPS'],
    dilutedEps: ['dilutedEPS'],
    basicShares: ['basicAverageShares'],
    dilutedShares: ['dilutedAverageShares'],
  },
  balance: {
    totalAssets: ['totalAssets'],
    totalLiabilities: ['totalLiabilitiesNetMinorityInterest'],
    stockholdersEquity: ['stockholdersEquity', 'commonStockEquity'],
    cash: ['cashAndCashEquivalents', 'cashFinancial'],
    cashAndShortTermInvestments: ['cashCashEquivalentsAndShortTermInvestments'],
    totalDebt: ['totalDebt'],
    netDebt: ['netDebt'],
    currentAssets: ['currentAssets'],
    currentLiabilities: ['currentLiabilities'],
    inventory: ['inventory'],
    receivables: ['receivables', 'accountsReceivable'],
    accountsPayable: ['accountsPayable', 'payables'],
    goodwill: ['goodwill'],
    retainedEarnings: ['retainedEarnings'],
    workingCapital: ['workingCapital'],
    tangibleBookValue: ['tangibleBookValue', 'netTangibleAssets'],
    investedCapital: ['investedCapital'],
    netPPE: ['netPPE'],
    sharesOutstanding: ['ordinarySharesNumber', 'shareIssued'],
  },
  cash: {
    operatingCashFlow: ['operatingCashFlow', 'cashFlowFromContinuingOperatingActivities'],
    investingCashFlow: ['investingCashFlow', 'cashFlowFromContinuingInvestingActivities'],
    financingCashFlow: ['financingCashFlow', 'cashFlowFromContinuingFinancingActivities'],
    capitalExpenditure: ['capitalExpenditure', 'purchaseOfPPE'],
    freeCashFlow: ['freeCashFlow'],
    dividendsPaid: ['cashDividendsPaid', 'commonStockDividendPaid'],
    repurchaseOfStock: ['repurchaseOfCapitalStock', 'commonStockPayments'],
    stockBasedCompensation: ['stockBasedCompensation'],
    depreciationAndAmortization: ['depreciationAndAmortization', 'depreciationAmortizationDepletion'],
    changeInInventory: ['changeInInventory'],
    changeInReceivables: ['changeInReceivables', 'changesInAccountReceivables'],
  },
};

type TimeSeriesRow = Record<string, unknown> & { date?: unknown };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Yahoo returns Date objects here, not ISO strings. */
function toIsoDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof value === 'number') return new Date(value * 1000).toISOString().slice(0, 10);
  return null;
}

export class YahooFinanceProvider implements FundamentalsProvider {
  readonly name = 'yahoo-finance2';

  /** Keyed by `${symbol}:${kind}:${frequency}`. */
  private readonly cache = new Map<string, StatementPeriod[]>();
  private readonly currencyCache = new Map<string, string | null>();

  /** Yahoo covers every listing we care about, so coverage is decided by the call. */
  async covers(): Promise<boolean> {
    return true;
  }

  private async fetchPeriods(
    symbol: string,
    kind: StatementKind,
    frequency: StatementFrequency,
  ): Promise<StatementPeriod[]> {
    const key = `${symbol}:${kind}:${frequency}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    let rows: TimeSeriesRow[];
    try {
      rows = (await yf.fundamentalsTimeSeries(symbol, {
        period1: PERIOD_START,
        type: frequency,
        module: MODULE_BY_KIND[kind],
      })) as TimeSeriesRow[];
    } catch {
      this.cache.set(key, []);
      return [];
    }

    const fields = FIELDS[kind];
    const periods: StatementPeriod[] = [];

    for (const row of rows ?? []) {
      const endDate = toIsoDate(row.date);
      if (!endDate) continue;

      const metrics: Partial<Record<MetricName, number>> = {};
      for (const [metric, names] of Object.entries(fields) as [MetricName, string[]][]) {
        for (const name of names) {
          const value = row[name];
          if (isNum(value)) {
            metrics[metric] = value;
            break;
          }
        }
      }
      if (Object.keys(metrics).length > 0) periods.push({ endDate, metrics });
    }

    periods.sort((a, b) => b.endDate.localeCompare(a.endDate));
    this.cache.set(key, periods);
    return periods;
  }

  async getStatements(
    symbols: string[],
    kind: StatementKind,
    frequency: StatementFrequency,
  ): Promise<Map<string, FinancialStatement>> {
    const out = new Map<string, FinancialStatement>();

    for (const symbol of symbols) {
      const periods = await this.fetchPeriods(symbol, kind, frequency);
      if (periods.length === 0) continue;
      out.set(symbol, {
        symbol,
        kind,
        frequency,
        periods,
        currency: (await this.getFilingCurrency(symbol)) ?? undefined,
      });
    }

    return out;
  }

  /** The currency the statements are reported in, which may differ from the quote currency. */
  async getFilingCurrency(symbol: string): Promise<string | null> {
    if (this.currencyCache.has(symbol)) return this.currencyCache.get(symbol) ?? null;

    let currency: string | null = null;
    try {
      const summary = await yf.quoteSummary(symbol, { modules: ['financialData'] });
      currency = summary.financialData?.financialCurrency ?? null;
    } catch {
      currency = null;
    }
    this.currencyCache.set(symbol, currency);
    return currency;
  }

  /**
   * Consensus estimates from earningsTrend.
   *
   * Yahoo labels periods relative to the current fiscal year: '0y' is the year
   * in progress and '+1y' the next one. Its own `growth` figure is the
   * consensus growth for that period, which is exactly what the forward PEG
   * variant (5.2) needs.
   */
  async getAnalystEstimates(symbol: string): Promise<AnalystEstimates | null> {
    let trend;
    try {
      const summary = await yf.quoteSummary(symbol, {
        modules: ['earningsTrend', 'financialData'],
      });
      trend = summary.earningsTrend?.trend ?? [];
      var targetPrice = summary.financialData?.targetMeanPrice ?? null;
    } catch {
      return null;
    }

    const yearly = trend.filter((t) => t.period === '0y' || t.period === '+1y');
    if (yearly.length === 0) return null;

    const current = yearly.find((t) => t.period === '0y');
    const next = yearly.find((t) => t.period === '+1y');

    const series: EstimatePoint[] = yearly
      .map((t) => ({
        fiscalYearEnd: toIsoDate(t.endDate) ?? '',
        eps: isNum(t.earningsEstimate?.avg) ? t.earningsEstimate.avg : null,
        revenue: isNum(t.revenueEstimate?.avg) ? t.revenueEstimate.avg : null,
        analystCount: isNum(t.earningsEstimate?.numberOfAnalysts)
          ? t.earningsEstimate.numberOfAnalysts
          : null,
      }))
      .filter((p) => p.fiscalYearEnd)
      .sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd));

    const nextEps = next?.earningsEstimate?.avg ?? null;
    const currentEps = current?.earningsEstimate?.avg ?? null;

    return {
      symbol,
      nextYearEps: isNum(nextEps) ? nextEps : null,
      nextYearEpsGrowth: isNum(next?.growth)
        ? next.growth
        : isNum(nextEps) && isNum(currentEps) && currentEps > 0
          ? nextEps / currentEps - 1
          : null,
      nextYearRevenueGrowth: isNum(next?.revenueEstimate?.growth)
        ? next.revenueEstimate.growth
        : null,
      analystCount: isNum(next?.earningsEstimate?.numberOfAnalysts)
        ? next.earningsEstimate.numberOfAnalysts
        : null,
      targetPrice: isNum(targetPrice) ? targetPrice : null,
      series,
    };
  }
}

export const yahooFinanceProvider = new YahooFinanceProvider();
