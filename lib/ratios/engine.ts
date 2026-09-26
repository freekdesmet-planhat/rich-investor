/**
 * The ratio engine (section 5).
 *
 * One pure function per ratio. Each returns the value, a colour, the target it
 * was judged against and where that target came from, the 5-year history for
 * the sparkline, and the translation key for its "?" explanation.
 *
 * Two cross-cutting rules, both learned from real data rather than assumed:
 *
 *   Currency. Price and market cap are quoted in the trading currency, the
 *   statements are in the filing currency, and those differ for cross-listed
 *   companies. Every price-based ratio converts first; when no rate is
 *   available the ratio is withheld rather than computed wrong.
 *
 *   Definitional breaks. A multi-year series can contain a step where the
 *   company changed what it reports (Adyen, gross to net revenue in 2023).
 *   Growth over such a step is meaningless, so the trend is suppressed and the
 *   card says why.
 */
import {
  afterLastBreak,
  annualSeries,
  averageForBasis,
  trendGrowth,
  detectSeriesBreak,
  drawdownFromHigh,
  lastNYears,
  latestGrowth,
  ratio,
  trailingFlow,
  trailingStock,
  type SeriesPoint,
} from './fundamentals';
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds';
import { capCurrency, identityFx, type FxRates } from '@/lib/providers/fx';
import type { SymbolBundle } from '@/lib/providers/marketData';
import type { FocusSector } from '@/lib/sectors/mapping';

export type RatioColor = 'green' | 'orange' | 'red' | 'gray';

export type RatioKey =
  | 'pe'
  | 'peg'
  | 'ev_ebit'
  | 'p_fcf'
  | 'earnings_quality'
  | 'roe'
  | 'roa'
  | 'eps_growth'
  | 'revenue_growth'
  | 'gross_margin'
  | 'net_margin'
  | 'debt'
  | 'dividend_yield'
  | 'payout_ratio'
  | 'rnd_adjusted_pe'
  | 'p_s'
  | 'p_b'
  | 'inventory_receivables'
  | 'drawdown_5y'
  | 'market_cap';

export interface RatioResult {
  key: RatioKey;
  value: number | null;
  unit: 'ratio' | 'percent' | 'currency' | 'years';
  color: RatioColor;
  targetLabel: string;
  targetSource: 'book' | 'app_default';
  /**
   * The currency the value is denominated in, or null when it is a pure ratio
   * or a percentage. Recorded so a stored figure can never be read in the wrong
   * currency later.
   */
  currency: string | null;
  thresholds: Record<string, unknown>;
  /** Last 5 fiscal years, oldest first. */
  history: SeriesPoint[];
  notApplicable: boolean;
  /**
   * 'missing_data' | 'not_applicable' | 'negative_base' | 'negative_growth'
   * | 'series_break' | 'no_fx_rate'
   */
  unavailableReason: string | null;
  detail: Record<string, unknown>;
}

/** Everything the engine derives once and every ratio then reads. */
export interface RatioContext {
  symbol: string;
  focusSector: FocusSector;
  /** True for banks and insurers: EV/EBIT and P/FCF are meaningless there. */
  isFinancial: boolean;
  /**
   * True for payment networks and processors. They stay in focus, but their
   * total assets and receivables carry customer settlement balances, so ROA is
   * adjusted and the inventory/receivables check does not apply.
   */
  isPaymentProcessor: boolean;
  /** Price converted into the filing currency. Null when no rate was available. */
  price: number | null;
  marketCap: number | null;
  marketCapUsd: number | null;
  filingCurrency: string | null;
  quoteCurrency: string | null;
  fxApplied: number | null;
  /**
   * Quote currency to USD, kept so the page can show a market cap in the
   * company's own currency as well as in the USD the $10bn rule is stated in.
   */
  quoteToUsd: number | null;
  thresholds: Thresholds;
  bundle: SymbolBundle;
}

const WINDOW_YEARS = 5;

const gray = (
  key: RatioKey,
  target: { label: string; source: 'book' | 'app_default' },
  reason: string,
  detail: Record<string, unknown> = {},
  history: SeriesPoint[] = [],
): RatioResult => ({
  key,
  value: null,
  unit: 'ratio',
  color: 'gray',
  targetLabel: target.label,
  targetSource: target.source,
  currency: null,
  thresholds: {},
  history,
  notApplicable: reason === 'not_applicable',
  unavailableReason: reason,
  detail,
});

/** Lower-is-better bands: green at or below `green`, orange up to `orange`. */
function bandLower(value: number, green: number, orange: number): RatioColor {
  if (value <= green) return 'green';
  if (value <= orange) return 'orange';
  return 'red';
}

/** Higher-is-better bands. */
function bandHigher(value: number, green: number, orange: number): RatioColor {
  if (value >= green) return 'green';
  if (value >= orange) return 'orange';
  return 'red';
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export function buildContext(
  bundle: SymbolBundle,
  options: {
    focusSector?: FocusSector;
    isFinancial?: boolean;
    isPaymentProcessor?: boolean;
    thresholds?: Thresholds;
    fx?: FxRates;
  } = {},
): RatioContext {
  const {
    focusSector = 'outside_focus',
    isFinancial = false,
    isPaymentProcessor = false,
    thresholds = DEFAULT_THRESHOLDS,
    fx = identityFx,
  } = options;

  const quoteCurrency = bundle.quote?.currency ?? null;
  const filingCurrency = bundle.filingCurrency ?? quoteCurrency;

  // Convert the market-facing figures into the filing currency, so every ratio
  // that divides a price by a statement figure compares like with like.
  const fxApplied =
    quoteCurrency && filingCurrency ? fx.rate(quoteCurrency, filingCurrency) : null;

  const rawPrice = bundle.quote?.price ?? null;
  const rawMarketCap = bundle.quote?.marketCap ?? null;

  const price = rawPrice != null && fxApplied != null ? rawPrice * fxApplied : null;
  const marketCap = rawMarketCap != null && fxApplied != null ? rawMarketCap * fxApplied : null;

  // The $10bn floor (5.19) is stated in USD, so it needs its own conversion.
  const toUsd = quoteCurrency ? fx.rate(quoteCurrency, 'USD') : null;
  // The market cap is reported in the major unit even where the price is quoted
  // in a minor one (LSE: price in GBp pence, cap in GBP), so it converts on the
  // major-unit rate. Without this every UK name lost its cap and failed the size
  // condition on missing data (A4). Price-based ratios keep `toUsd`, which stays
  // null for a pence quote — they render grey rather than a wrong number, which
  // is the honest state until a full pence pass.
  const capToUsd = fx.rate(capCurrency(quoteCurrency), 'USD');
  const marketCapUsd = rawMarketCap != null && capToUsd != null ? rawMarketCap * capToUsd : null;

  return {
    symbol: bundle.symbol,
    focusSector,
    isFinancial,
    isPaymentProcessor,
    price,
    marketCap,
    marketCapUsd,
    filingCurrency,
    quoteCurrency,
    fxApplied,
    quoteToUsd: toUsd,
    thresholds,
    bundle,
  };
}

// ---------------------------------------------------------------------------
// Shared derived inputs
// ---------------------------------------------------------------------------

export function derive(ctx: RatioContext) {
  const { income, balance, cash } = ctx.bundle.statements;

  const revenue = trailingFlow(income.quarterly, income.annual, 'revenue');
  const netIncome = trailingFlow(income.quarterly, income.annual, 'netIncome');
  const grossProfit = trailingFlow(income.quarterly, income.annual, 'grossProfit');
  const ebit = trailingFlow(income.quarterly, income.annual, 'ebit');
  const ebitdaReported = trailingFlow(income.quarterly, income.annual, 'ebitda');
  const rnd = trailingFlow(income.quarterly, income.annual, 'researchAndDevelopment');
  const dilutedEps = trailingFlow(income.quarterly, income.annual, 'dilutedEps');
  const dilutedShares = trailingStock(income.quarterly, income.annual, 'dilutedShares');
  const interestExpense = trailingFlow(income.quarterly, income.annual, 'interestExpense');

  const totalDebt = trailingStock(balance.quarterly, balance.annual, 'totalDebt');
  const cashPos = trailingStock(balance.quarterly, balance.annual, 'cash');
  const equity = trailingStock(balance.quarterly, balance.annual, 'stockholdersEquity');

  const ocf = trailingFlow(cash.quarterly, cash.annual, 'operatingCashFlow');
  const capex = trailingFlow(cash.quarterly, cash.annual, 'capitalExpenditure');
  const dividendsPaid = trailingFlow(cash.quarterly, cash.annual, 'dividendsPaid');
  const dAndA = trailingFlow(cash.quarterly, cash.annual, 'depreciationAndAmortization');

  // Capex is reported as a negative outflow by some sources and positive by
  // others; normalise to a subtraction either way.
  const freeCashFlow =
    ocf.value != null && capex.value != null ? ocf.value - Math.abs(capex.value) : null;

  // EBITDA is not always reported; EBIT + D&A is the book's own definition.
  const ebitda =
    ebitdaReported.value ??
    (ebit.value != null && dAndA.value != null ? ebit.value + Math.abs(dAndA.value) : null);

  const netDebt =
    totalDebt.value != null && cashPos.value != null ? totalDebt.value - cashPos.value : null;

  const enterpriseValue =
    ctx.marketCap != null && totalDebt.value != null && cashPos.value != null
      ? ctx.marketCap + totalDebt.value - cashPos.value
      : null;

  const epsSeries = lastNYears(annualSeries(income.annual, 'dilutedEps'), WINDOW_YEARS);
  const revenueSeries = lastNYears(annualSeries(income.annual, 'revenue'), WINDOW_YEARS);
  const grossMarginSeries = marginSeries(income.annual, 'grossProfit');
  const netMarginSeries = marginSeries(income.annual, 'netIncome');

  return {
    revenue,
    netIncome,
    grossProfit,
    ebit,
    ebitda,
    rnd,
    dilutedEps,
    dilutedShares,
    interestExpense,
    totalDebt,
    cash: cashPos,
    equity,
    ocf,
    capex,
    dividendsPaid,
    freeCashFlow,
    netDebt,
    enterpriseValue,
    epsSeries,
    revenueSeries,
    grossMarginSeries,
    netMarginSeries,
  };

  function marginSeries(
    statement: typeof income.annual,
    numerator: 'grossProfit' | 'netIncome',
  ): SeriesPoint[] {
    const top = annualSeries(statement, numerator);
    const rev = annualSeries(statement, 'revenue');
    return lastNYears(
      top
        .map((point) => {
          const match = rev.find((r) => r.period === point.period);
          return match && match.value > 0
            ? { period: point.period, value: point.value / match.value }
            : null;
        })
        .filter((x): x is SeriesPoint => x !== null),
      WINDOW_YEARS,
    );
  }
}

export type Derived = ReturnType<typeof derive>;

// ---------------------------------------------------------------------------
// 5.1 P/E
// ---------------------------------------------------------------------------

export function computePe(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.pe;
  const target = { label: t.label, source: t.source };

  if (ctx.price == null) {
    return gray('pe', target, ctx.fxApplied == null ? 'no_fx_rate' : 'missing_data', {
      quoteCurrency: ctx.quoteCurrency,
      filingCurrency: ctx.filingCurrency,
    });
  }
  if (d.dilutedEps.value == null) return gray('pe', target, 'missing_data');
  // A P/E out of a loss is not a valuation, it is an artefact.
  if (d.dilutedEps.value <= 0) {
    return gray('pe', target, 'negative_base', { dilutedEps: d.dilutedEps.value });
  }

  const value = ctx.price / d.dilutedEps.value;

  return {
    key: 'pe',
    value,
    unit: 'ratio',
    color: bandLower(value, t.value.green, t.value.orange),
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: {
      price: ctx.price,
      dilutedEps: d.dilutedEps.value,
      basis: d.dilutedEps.basis,
      fxApplied: ctx.fxApplied,
      currencyConverted: ctx.quoteCurrency !== ctx.filingCurrency,
    },
  };
}

// ---------------------------------------------------------------------------
// 5.2 PEG — threshold depends on the growth category
// ---------------------------------------------------------------------------

export type GrowthCategory = 'high_growth' | 'average_growth' | 'low_growth';

/**
 * The book's growth bands (section 6), by 5-year EPS CAGR.
 *
 * This is only the growth axis. The full Lynch classification — which also
 * separates cyclicals, turnarounds and financial institutions — is build step 5
 * and layers on top of this.
 */
export function growthCategory(
  epsCagr: number | null,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): GrowthCategory {
  if (epsCagr == null) return 'low_growth';
  if (epsCagr >= thresholds.lynch.value.highGrowth) return 'high_growth';
  if (epsCagr >= thresholds.lynch.value.averageGrowth) return 'average_growth';
  return 'low_growth';
}

export function computePeg(
  ctx: RatioContext,
  d: Derived,
  category: GrowthCategory,
  pe: RatioResult,
): RatioResult {
  const t = ctx.thresholds.peg;
  const threshold = t.value[category];
  const target = { label: `≤ ${threshold}`, source: t.source };

  // Forward variant (5.2), when a source supplied estimates.
  //
  // Consensus EPS is quoted in the *trading* currency, while trailing EPS comes
  // from the statements in the filing currency. For ASML (USD listing, EUR
  // filings) comparing them directly overstated expected growth by the whole FX
  // factor — 88% against an actual 62%.
  const estimates = ctx.bundle.estimates;
  const nextYearEpsInFilingCurrency =
    estimates?.nextYearEps != null && ctx.fxApplied != null
      ? estimates.nextYearEps * ctx.fxApplied
      : null;

  const forwardGrowth =
    nextYearEpsInFilingCurrency != null && d.dilutedEps.value && d.dilutedEps.value > 0
      ? nextYearEpsInFilingCurrency / d.dilutedEps.value - 1
      : (estimates?.nextYearEpsGrowth ?? null);
  const forwardPeg =
    pe.value != null && forwardGrowth != null && forwardGrowth > 0
      ? pe.value / (forwardGrowth * 100)
      : null;

  // Computed above the exits, and carried on the grey results too. Shrinking or
  // interrupted reported earnings are exactly the case the forward figure
  // exists for — chapter 9's quality company in a temporary dip — and returning
  // early without it left condition 5 blind to the only stocks it was written
  // for. The threshold rides along because a grey result has no `thresholds`,
  // and the condition still has to know which band it was judged against.
  const forwardDetail = {
    forwardGrowth,
    forwardPeg,
    nextYearEps: estimates?.nextYearEps ?? null,
    nextYearEpsInFilingCurrency,
    estimatesSource: ctx.bundle.estimatesSource,
    threshold,
    category,
  };

  if (pe.value == null) {
    return gray('peg', target, pe.unavailableReason ?? 'missing_data', forwardDetail);
  }

  // Growth must be measured on a consistent basis; a definitional break makes
  // the CAGR meaningless (see detectSeriesBreak).
  const epsBreak = detectSeriesBreak(d.epsSeries);
  const usableEps = epsBreak.hasBreak ? afterLastBreak(d.epsSeries) : d.epsSeries;
  const growth = trendGrowth(usableEps);

  if (growth.value == null || growth.value <= 0) {
    // Flat or falling earnings are not absent data. Reporting them as
    // 'missing_data' put "No data available" on cards whose every input was
    // present — the reason the number is withheld is that a PEG out of
    // negative growth is meaningless, and that is worth saying.
    const reason = epsBreak.hasBreak
      ? 'series_break'
      : growth.value == null
        ? 'missing_data'
        : 'negative_growth';
    return gray(
      'peg',
      target,
      reason,
      { ...forwardDetail, epsBreak, years: growth.years, epsCagr: growth.value },
      d.epsSeries,
    );
  }

  const value = pe.value / (growth.value * 100);
  const orangeLimit = threshold * t.value.orangeMultiplier;

  return {
    key: 'peg',
    value,
    unit: 'ratio',
    color: bandLower(value, threshold, orangeLimit),
    targetLabel: target.label,
    targetSource: t.source,
    currency: null,
    thresholds: { threshold, orangeLimit, category },
    history: d.epsSeries,
    notApplicable: false,
    unavailableReason: null,
    detail: {
      pe: pe.value,
      epsCagr: growth.value,
      cagrYears: growth.years,
      growthMethod: growth.method,
      endpointCagr: growth.endpointCagr,
      ...forwardDetail,
      seriesBreak: epsBreak.hasBreak ? epsBreak : null,
    },
  };
}

// ---------------------------------------------------------------------------
// 5.3 EV/EBIT — not applicable to banks and insurers
// ---------------------------------------------------------------------------

export function computeEvEbit(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.evEbit;
  const target = { label: t.label, source: t.source };

  if (ctx.isFinancial) return gray('ev_ebit', target, 'not_applicable');
  if (d.enterpriseValue == null || d.ebit.value == null) {
    return gray('ev_ebit', target, ctx.fxApplied == null ? 'no_fx_rate' : 'missing_data');
  }
  if (d.ebit.value <= 0) return gray('ev_ebit', target, 'negative_base', { ebit: d.ebit.value });

  const value = d.enterpriseValue / d.ebit.value;

  return {
    key: 'ev_ebit',
    value,
    unit: 'ratio',
    color: bandLower(value, t.value.green, t.value.orange),
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: {
      enterpriseValue: d.enterpriseValue,
      marketCap: ctx.marketCap,
      totalDebt: d.totalDebt.value,
      cash: d.cash.value,
      ebit: d.ebit.value,
    },
  };
}

// ---------------------------------------------------------------------------
// 5.4 P/FCF
// ---------------------------------------------------------------------------

export function computePFcf(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.pFcf;
  const target = { label: t.label, source: t.source };

  if (ctx.isFinancial) return gray('p_fcf', target, 'not_applicable');
  if (ctx.marketCap == null || d.freeCashFlow == null) {
    return gray('p_fcf', target, ctx.fxApplied == null ? 'no_fx_rate' : 'missing_data');
  }

  // Negative free cash flow is a red flag, not a missing value (5.4).
  if (d.freeCashFlow <= 0) {
    return {
      key: 'p_fcf',
      value: null,
      unit: 'ratio',
      color: 'red',
      targetLabel: t.label,
      targetSource: t.source,
      currency: null,
      thresholds: t.value,
      history: [],
      notApplicable: false,
      unavailableReason: 'negative_base',
      detail: { freeCashFlow: d.freeCashFlow, ocf: d.ocf.value, capex: d.capex.value },
    };
  }

  const value = ctx.marketCap / d.freeCashFlow;

  return {
    key: 'p_fcf',
    value,
    unit: 'ratio',
    color: bandLower(value, t.value.green, t.value.orange),
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: { marketCap: ctx.marketCap, freeCashFlow: d.freeCashFlow, ocf: d.ocf.value, capex: d.capex.value },
  };
}

// ---------------------------------------------------------------------------
// 5.5 Earnings quality: operating cash flow vs net income
// ---------------------------------------------------------------------------

export function computeEarningsQuality(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.earningsQuality;
  const target = { label: t.label, source: t.source };

  if (d.ocf.value == null || d.netIncome.value == null) {
    return gray('earnings_quality', target, 'missing_data');
  }

  // The book calls this out literally: negative operating cash flow against
  // positive net income is a red flag, whatever the ratio works out to.
  if (d.ocf.value < 0 && d.netIncome.value > 0) {
    return {
      key: 'earnings_quality',
      value: ratio(d.ocf.value, d.netIncome.value),
      unit: 'ratio',
      color: 'red',
      targetLabel: t.label,
      targetSource: t.source,
      currency: null,
      thresholds: t.value,
      history: [],
      notApplicable: false,
      unavailableReason: null,
      detail: { ocf: d.ocf.value, netIncome: d.netIncome.value, redFlag: 'negative_ocf' },
    };
  }

  if (d.netIncome.value <= 0) {
    return gray('earnings_quality', target, 'negative_base', { netIncome: d.netIncome.value });
  }

  const value = d.ocf.value / d.netIncome.value;

  return {
    key: 'earnings_quality',
    value,
    unit: 'ratio',
    color: bandHigher(value, t.value.green, t.value.orange),
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: { ocf: d.ocf.value, netIncome: d.netIncome.value },
  };
}

// ---------------------------------------------------------------------------
// 5.6 ROE — green needs 15%+ in 4 of the last 5 years, not just the latest
// ---------------------------------------------------------------------------

export function computeRoe(ctx: RatioContext): RatioResult {
  const t = ctx.thresholds.roe;
  const target = { label: t.label, source: t.source };
  const { income, balance } = ctx.bundle.statements;

  const history = returnSeries(income.annual, balance.annual, 'stockholdersEquity');
  const netIncome = trailingFlow(income.quarterly, income.annual, 'netIncome');
  const current = ratio(
    netIncome.value,
    averageForBasis(balance.quarterly, balance.annual, 'stockholdersEquity', netIncome.basis),
  );

  if (current == null) return gray('roe', target, 'missing_data', {}, history);

  const qualifyingYears = history.filter((p) => p.value >= t.value.green).length;
  const yearsAvailable = history.length;

  // The book's rule is about consistency, so a single good year is not green.
  const meetsConsistency =
    yearsAvailable > 0 &&
    qualifyingYears >= Math.min(t.value.yearsRequired, Math.max(1, yearsAvailable - 1));

  const color: RatioColor =
    current >= t.value.green && meetsConsistency
      ? 'green'
      : current >= t.value.orange
        ? 'orange'
        : 'red';

  return {
    key: 'roe',
    value: current,
    unit: 'percent',
    color,
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history,
    notApplicable: false,
    unavailableReason: null,
    detail: { qualifyingYears, yearsAvailable, meetsConsistency },
  };
}

// ---------------------------------------------------------------------------
// 5.7 ROA
// ---------------------------------------------------------------------------

export function computeRoa(ctx: RatioContext, d?: Derived): RatioResult {
  const t = ctx.thresholds.roa;
  const target = { label: t.label, source: t.source };
  const { income, balance } = ctx.bundle.statements;

  const netIncomeTrailing = trailingFlow(income.quarterly, income.annual, 'netIncome');
  const netIncome = netIncomeTrailing.value;
  const rawAverageAssets = averageForBasis(
    balance.quarterly,
    balance.annual,
    'totalAssets',
    netIncomeTrailing.basis,
  );
  const rawHistory = returnSeries(income.annual, balance.annual, 'totalAssets');
  const rawValue = ratio(netIncome, rawAverageAssets);

  if (!ctx.isPaymentProcessor) {
    if (rawValue == null) return gray('roa', target, 'missing_data', {}, rawHistory);
    return {
      key: 'roa',
      value: rawValue,
      unit: 'percent',
      color: bandHigher(rawValue, t.value.green, t.value.orange),
      targetLabel: t.label,
      targetSource: t.source,
      currency: null,
      thresholds: t.value,
      history: rawHistory,
      notApplicable: false,
      unavailableReason: null,
      detail: {
        qualifyingYears: rawHistory.filter((p) => p.value >= t.value.green).length,
        yearsAvailable: rawHistory.length,
        isAdjusted: false,
      },
    };
  }

  // --- payment processors ---------------------------------------------------
  // Settlement float sits inside total assets and has nothing to do with
  // operating performance, so it is deducted before the ratio is taken.
  const settlement = settlementFunds(ctx, d);

  // Floor the deduction at shareholders' equity.
  //
  // Settlement float is liability-funded by definition — it is money owed back
  // to merchants — so it can only ever be subtracted from the liability-funded
  // part of the balance sheet. Equity-funded assets belong to the company
  // whatever the float is doing. Without this floor the excess-cash proxy
  // stripped almost the whole balance sheet and put Adyen's ROA at 261%, which
  // flipped it to buy-worthy on a fabricated figure. The floor also restores
  // the relationship that must hold anyway: ROA cannot exceed ROE.
  const equity = d?.equity.value ?? null;
  const adjustedAverageAssets =
    rawAverageAssets != null && settlement.amount != null
      ? Math.max(rawAverageAssets - settlement.amount, equity ?? 1, 1)
      : null;

  const adjustedValue = ratio(netIncome, adjustedAverageAssets);

  if (adjustedValue == null) {
    // Fall back to the raw figure rather than reporting nothing, but say so.
    if (rawValue == null) return gray('roa', target, 'missing_data', {}, rawHistory);
    return {
      key: 'roa',
      value: rawValue,
      unit: 'percent',
      color: bandHigher(rawValue, t.value.green, t.value.orange),
      targetLabel: t.label,
      targetSource: t.source,
      currency: null,
      thresholds: t.value,
      history: rawHistory,
      notApplicable: false,
      unavailableReason: null,
      detail: {
        isAdjusted: false,
        adjustmentFailed: true,
        note: 'settlement_balance_unavailable',
        yearsAvailable: rawHistory.length,
      },
    };
  }

  const adjustedHistory = rawHistory.map((point) => ({
    period: point.period,
    // Scale each year by the same adjustment factor; per-year settlement
    // balances are not reliably available, so the shape is indicative.
    value:
      rawAverageAssets && adjustedAverageAssets
        ? point.value * (rawAverageAssets / adjustedAverageAssets)
        : point.value,
  }));

  return {
    key: 'roa',
    value: adjustedValue,
    unit: 'percent',
    color: bandHigher(adjustedValue, t.value.green, t.value.orange),
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: adjustedHistory,
    notApplicable: false,
    unavailableReason: null,
    detail: {
      isAdjusted: true,
      rawValue,
      adjustedValue,
      totalAssets: rawAverageAssets,
      adjustedAssets: adjustedAverageAssets,
      settlementFunds: settlement.amount,
      settlementBasis: settlement.basis,
      isApproximation: settlement.basis !== 'reported',
      equityFloorApplied:
        rawAverageAssets != null &&
        settlement.amount != null &&
        equity != null &&
        rawAverageAssets - settlement.amount < equity,
      qualifyingYears: adjustedHistory.filter((p) => p.value >= t.value.green).length,
      yearsAvailable: adjustedHistory.length,
      noteKey: 'roa_payment_processor_adjusted',
    },
  };
}

/**
 * Estimates the customer settlement balance sitting inside total assets.
 *
 * Preferred: the reported restricted-cash line, which is what Visa uses for
 * exactly this. Most processors do not break it out — Adyen and PayPal fold it
 * into cash and payables — so the fallback is the excess-cash proxy: cash
 * beyond six months of operating expenses is not working capital for an
 * asset-light processor, it is float. The result is labelled an approximation
 * wherever it is shown.
 */
function settlementFunds(
  ctx: RatioContext,
  d?: Derived,
): { amount: number | null; basis: 'reported' | 'excess_cash_proxy' | 'none' } {
  const { balance, income } = ctx.bundle.statements;

  const totalAssets = trailingStock(balance.quarterly, balance.annual, 'totalAssets').value;
  const reported = trailingStock(balance.quarterly, balance.annual, 'restrictedCash').value;

  // Only trust the reported line when it is large enough to *be* the float.
  // Adyen reports EUR 331m of restricted cash against EUR 11.8bn of assets —
  // a real line item, but ordinary escrow, not the merchant settlement balance
  // that distorts the ratio. Taking it at face value moved ROA by 0.3pp and
  // silently skipped the proxy that was supposed to handle exactly this case.
  const MATERIALITY = 0.1;
  if (
    reported != null &&
    reported > 0 &&
    totalAssets != null &&
    reported / totalAssets >= MATERIALITY
  ) {
    return { amount: reported, basis: 'reported' };
  }

  const cash = d?.cash.value ?? trailingStock(balance.quarterly, balance.annual, 'cash').value;
  if (cash == null) return { amount: null, basis: 'none' };

  // Operating expenses, or revenue minus EBIT when not reported separately.
  const opex =
    trailingFlow(income.quarterly, income.annual, 'operatingExpenses').value ??
    (() => {
      const revenue = d?.revenue.value ?? trailingFlow(income.quarterly, income.annual, 'revenue').value;
      const ebit = d?.ebit.value ?? trailingFlow(income.quarterly, income.annual, 'ebit').value;
      return revenue != null && ebit != null ? revenue - ebit : null;
    })();

  if (opex == null || opex <= 0) return { amount: null, basis: 'none' };

  const sixMonthsOpex = opex / 2;
  const excess = cash - sixMonthsOpex;
  return excess > 0
    ? { amount: excess, basis: 'excess_cash_proxy' }
    : { amount: null, basis: 'none' };
}

function returnSeries(
  income: SymbolBundle['statements']['income']['annual'],
  balance: SymbolBundle['statements']['balance']['annual'],
  denominator: 'stockholdersEquity' | 'totalAssets',
): SeriesPoint[] {
  const net = annualSeries(income, 'netIncome');
  const base = annualSeries(balance, denominator);
  return lastNYears(
    net
      .map((point) => {
        const match = base.find((b) => b.period === point.period);
        return match && match.value > 0
          ? { period: point.period, value: point.value / match.value }
          : null;
      })
      .filter((x): x is SeriesPoint => x !== null),
    WINDOW_YEARS,
  );
}

// ---------------------------------------------------------------------------
// 5.8 / 5.9 Growth
// ---------------------------------------------------------------------------

function growthRatio(
  key: 'eps_growth' | 'revenue_growth',
  series: SeriesPoint[],
  t: { value: { green: number; orange: number }; label: string; source: 'book' | 'app_default' },
  extra: Record<string, unknown> = {},
): RatioResult {
  const target = { label: t.label, source: t.source };
  const seriesBreak = detectSeriesBreak(series);
  const usable = seriesBreak.hasBreak ? afterLastBreak(series) : series;
  const growth = trendGrowth(usable);

  if (growth.value == null) {
    return gray(
      key,
      target,
      seriesBreak.hasBreak ? 'series_break' : 'missing_data',
      { seriesBreak: seriesBreak.hasBreak ? seriesBreak : null, ...extra },
      series,
    );
  }

  return {
    key,
    value: growth.value,
    unit: 'percent',
    color: bandHigher(growth.value, t.value.green, t.value.orange),
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: series,
    notApplicable: false,
    unavailableReason: null,
    detail: {
      cagrYears: growth.years,
      growthMethod: growth.method,
      endpointCagr: growth.endpointCagr,
      pointsUsed: growth.pointsUsed,
      latestGrowth: latestGrowth(usable),
      seriesBreak: seriesBreak.hasBreak ? seriesBreak : null,
      ...extra,
    },
  };
}

export function computeEpsGrowth(ctx: RatioContext, d: Derived): RatioResult {
  const estimates = ctx.bundle.estimates;
  return growthRatio('eps_growth', d.epsSeries, ctx.thresholds.epsGrowth, {
    forwardGrowth: estimates?.nextYearEpsGrowth ?? null,
    estimatesSource: ctx.bundle.estimatesSource,
  });
}

export function computeRevenueGrowth(ctx: RatioContext, d: Derived): RatioResult {
  return growthRatio('revenue_growth', d.revenueSeries, ctx.thresholds.revenueGrowth);
}

// ---------------------------------------------------------------------------
// 5.10 Margins — gross margin is green at 50%+ OR on a 5-year rise
// ---------------------------------------------------------------------------

export function computeGrossMargin(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.grossMargin;
  const target = { label: t.label, source: t.source };
  const series = d.grossMarginSeries;
  const current = series.at(-1)?.value ?? null;

  if (current == null) return gray('gross_margin', target, 'missing_data', {}, series);

  const risingEveryYear =
    series.length >= 3 && series.every((p, i) => i === 0 || p.value > series[i - 1].value);
  const declining = series.length >= 2 && current < series[0].value;

  const color: RatioColor =
    current >= t.value.green || risingEveryYear
      ? 'green'
      : declining
        ? 'red'
        : current >= t.value.orange
          ? 'orange'
          : 'red';

  return {
    key: 'gross_margin',
    value: current,
    unit: 'percent',
    color,
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: series,
    notApplicable: false,
    unavailableReason: null,
    detail: { risingEveryYear, declining, yearsAvailable: series.length },
  };
}

export function computeNetMargin(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.netMargin;
  const target = { label: t.label, source: t.source };
  const series = d.netMarginSeries;
  const current = series.at(-1)?.value ?? null;

  if (current == null) return gray('net_margin', target, 'missing_data', {}, series);

  return {
    key: 'net_margin',
    value: current,
    unit: 'percent',
    color: bandHigher(current, t.value.green, t.value.orange),
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: series,
    notApplicable: false,
    unavailableReason: null,
    detail: { sp500Average: 0.12 },
  };
}

// ---------------------------------------------------------------------------
// 5.11 Debt and solvency
// ---------------------------------------------------------------------------

export function computeDebt(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.debt;
  const target = { label: t.label, source: t.source };

  if (d.netDebt == null || d.ebitda == null) return gray('debt', target, 'missing_data');

  // Net cash is unambiguously good, whatever EBITDA is.
  const value = d.ebitda > 0 ? d.netDebt / d.ebitda : null;
  const netCash = d.netDebt < 0;

  const coverage =
    d.ebit.value != null && d.interestExpense.value != null && d.interestExpense.value !== 0
      ? d.ebit.value / Math.abs(d.interestExpense.value)
      : null;

  const color: RatioColor = netCash
    ? 'green'
    : value == null
      ? 'gray'
      : bandLower(value, t.value.netDebtEbitdaGreen, t.value.netDebtEbitdaOrange);

  return {
    key: 'debt',
    value,
    unit: 'ratio',
    color,
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: value == null && !netCash ? 'missing_data' : null,
    detail: {
      netDebt: d.netDebt,
      totalDebt: d.totalDebt.value,
      cash: d.cash.value,
      ebitda: d.ebitda,
      netCash,
      interestCoverage: coverage,
      coverageColor:
        coverage == null
          ? 'gray'
          : bandHigher(coverage, t.value.coverageGreen, t.value.coverageOrange),
    },
  };
}

// ---------------------------------------------------------------------------
// 5.12 / 5.13 Dividend
// ---------------------------------------------------------------------------

/**
 * Positive evidence that a company pays no dividend.
 *
 * The provider returns null both for "this company pays nothing" and for "we
 * could not get it", and the page rendered a bare dash either way — the reader
 * could not tell a fact from a gap. A cash flow statement that resolved (it
 * produced an operating cash flow) but carries no dividends line is the company
 * saying it paid none. No statement at all is still genuinely unknown, and stays
 * that way: guessing "no dividend" from an absent statement would replace one
 * wrong answer with a more confident one.
 */
function paysNoDividend(d: Derived): boolean {
  if (d.dividendsPaid.value === 0) return true;
  return d.ocf.value != null && d.dividendsPaid.value == null;
}

export function computeDividendYield(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.dividendYield;
  const target = { label: t.label, source: t.source };

  const dividend = ctx.bundle.quote?.dividendPerShare ?? null;
  const rawPrice = ctx.bundle.quote?.price ?? null;

  // Both figures come from the quote, so this one needs no FX conversion.
  if (dividend == null || rawPrice == null || rawPrice <= 0) {
    return gray('dividend_yield', target, paysNoDividend(d) ? 'no_dividend' : 'missing_data');
  }

  // An explicit zero is the company telling us, not the source failing.
  if (dividend === 0) return gray('dividend_yield', target, 'no_dividend');

  const value = dividend / rawPrice;

  // Not a buy criterion: only an unusually high yield says anything, and what
  // it says is "be careful".
  const color: RatioColor =
    value > t.value.warnRed ? 'red' : value > t.value.warnOrange ? 'orange' : 'gray';

  return {
    key: 'dividend_yield',
    value,
    unit: 'percent',
    color,
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: { dividendPerShare: dividend, informationalOnly: true },
  };
}

export function computePayoutRatio(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.payoutRatio;
  const target = { label: t.label, source: t.source };

  if (d.dividendsPaid.value === 0 || paysNoDividend(d)) {
    return gray('payout_ratio', target, 'no_dividend');
  }

  if (d.dividendsPaid.value == null || d.netIncome.value == null || d.netIncome.value <= 0) {
    return gray('payout_ratio', target, 'missing_data');
  }

  const value = Math.abs(d.dividendsPaid.value) / d.netIncome.value;

  const color: RatioColor =
    value >= t.value.red
      ? 'red'
      : value <= t.value.green
        ? 'green'
        : value <= t.value.orange
          ? 'orange'
          : 'red';

  return {
    key: 'payout_ratio',
    value,
    unit: 'percent',
    color,
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: { dividendsPaid: Math.abs(d.dividendsPaid.value), netIncome: d.netIncome.value },
  };
}

// ---------------------------------------------------------------------------
// 5.14 R&D-adjusted P/E — IT and interactive media only
// ---------------------------------------------------------------------------

export function computeRndAdjustedPe(ctx: RatioContext, d: Derived): RatioResult {
  const t = ctx.thresholds.rndAdjustedPe;
  const target = { label: t.label, source: t.source };

  const applies =
    ctx.focusSector === 'information_technology' || ctx.focusSector === 'entertainment_media';
  if (!applies) return gray('rnd_adjusted_pe', target, 'not_applicable');

  if (
    ctx.price == null ||
    d.netIncome.value == null ||
    d.rnd.value == null ||
    d.dilutedShares.value == null ||
    d.dilutedShares.value <= 0
  ) {
    return gray('rnd_adjusted_pe', target, ctx.fxApplied == null ? 'no_fx_rate' : 'missing_data');
  }

  const adjustedEps = (d.netIncome.value + d.rnd.value) / d.dilutedShares.value;
  if (adjustedEps <= 0) return gray('rnd_adjusted_pe', target, 'negative_base');

  const value = ctx.price / adjustedEps;

  return {
    key: 'rnd_adjusted_pe',
    value,
    unit: 'ratio',
    color: bandLower(value, t.value.green, t.value.orange),
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: {
      adjustedEps,
      rnd: d.rnd.value,
      rndOverRevenue: ratio(d.rnd.value, d.revenue.value),
      reportedEps: d.dilutedEps.value,
    },
  };
}

// ---------------------------------------------------------------------------
// 5.15 / 5.16 P/S and P/B — informational, always gray
// ---------------------------------------------------------------------------

export function computePs(ctx: RatioContext, d: Derived): RatioResult {
  const value = ratio(ctx.marketCap, d.revenue.value);
  return {
    key: 'p_s',
    value,
    unit: 'ratio',
    color: 'gray',
    targetLabel: 'informational',
    targetSource: 'book',
    currency: null,
    thresholds: {},
    history: [],
    notApplicable: false,
    unavailableReason: value == null ? 'missing_data' : null,
    detail: { informationalOnly: true },
  };
}

export function computePb(ctx: RatioContext, d: Derived): RatioResult {
  const value = ratio(ctx.marketCap, d.equity.value);
  return {
    key: 'p_b',
    value,
    unit: 'ratio',
    color: 'gray',
    targetLabel: 'informational; relevant for banks and insurers',
    targetSource: 'book',
    currency: null,
    thresholds: {},
    history: [],
    notApplicable: false,
    unavailableReason: value == null ? 'missing_data' : null,
    detail: { informationalOnly: true, relevantFor: 'financials' },
  };
}

// ---------------------------------------------------------------------------
// 5.17 Inventory and receivables vs revenue
// ---------------------------------------------------------------------------

export function computeInventoryReceivables(ctx: RatioContext, d: Derived): RatioResult {
  const target = { label: 'not growing faster than revenue', source: 'book' as const };
  const { balance } = ctx.bundle.statements;

  // Receivables for a payment processor are settlement balances that scale with
  // transaction volume, not a collection-risk signal. Renormalising against
  // total payment volume would be the alternative, but no provider exposes TPV
  // cleanly, so n/a is the honest answer rather than a fragile proxy.
  if (ctx.isPaymentProcessor) {
    return gray('inventory_receivables', target, 'not_applicable', {
      noteKey: 'inventory_payment_processor_na',
      reason: 'settlement_balances',
    });
  }

  const inventory = annualSeries(balance.annual, 'inventory');
  const receivables = annualSeries(balance.annual, 'receivables');
  const revenueGrowth = latestGrowth(d.revenueSeries);

  // The book calls a business with no inventory the ideal model (software,
  // payment networks), so absence is a gray, never a red.
  const hasInventory = inventory.length >= 2 && inventory.at(-1)!.value > 0;
  const hasReceivables = receivables.length >= 2;

  if (!hasInventory && !hasReceivables) {
    return gray('inventory_receivables', target, 'not_applicable', { reason: 'no_inventory' });
  }
  if (revenueGrowth == null) return gray('inventory_receivables', target, 'missing_data');

  const inventoryGrowth = hasInventory ? latestGrowth(inventory) : null;
  const receivablesGrowth = hasReceivables ? latestGrowth(receivables) : null;

  const inventoryOutpaces = inventoryGrowth != null && inventoryGrowth > revenueGrowth;
  const receivablesOutpace = receivablesGrowth != null && receivablesGrowth > revenueGrowth;
  const outpacing = inventoryOutpaces || receivablesOutpace;

  // Show the figure that drove the colour. Adyen is the case for this: its
  // inventory shrank 23% while receivables grew 64% against 19% revenue growth,
  // so displaying the inventory figure made a red card look like a green one.
  const driver: 'inventory' | 'receivables' = inventoryOutpaces
    ? 'inventory'
    : receivablesOutpace
      ? 'receivables'
      : inventoryGrowth != null
        ? 'inventory'
        : 'receivables';

  return {
    key: 'inventory_receivables',
    value: driver === 'inventory' ? inventoryGrowth : receivablesGrowth,
    unit: 'percent',
    color: outpacing ? 'red' : 'green',
    targetLabel: target.label,
    targetSource: 'book',
    currency: null,
    thresholds: {},
    history: inventory,
    notApplicable: false,
    unavailableReason: null,
    detail: {
      inventoryGrowth,
      receivablesGrowth,
      revenueGrowth,
      outpacing,
      hasInventory,
      driver,
      inventoryOutpaces,
      receivablesOutpace,
    },
  };
}

// ---------------------------------------------------------------------------
// 5.18 Drawdown from the 5-year high — the core signal
// ---------------------------------------------------------------------------

export function computeDrawdown(ctx: RatioContext): RatioResult {
  const t = ctx.thresholds.drawdown;
  const target = { label: t.label, source: t.source };

  // Price history and the current price are both in the quote currency, so this
  // ratio is unaffected by the filing currency.
  const result = drawdownFromHigh(ctx.bundle.priceHistory, ctx.bundle.quote?.price ?? null);
  if (result.drawdown == null) return gray('drawdown_5y', target, 'missing_data');

  const decline = -result.drawdown;

  // Neutral on purpose. Green and red mean passed and failed everywhere else
  // on the page, and a deep decline is the entry signal rather than a pass — a
  // -66% drawdown rendered green three pixels from a red "fail" dot had the two
  // colours meaning opposite things on one screen. Whether it clears the
  // threshold is stated in `detail` and shown as a tag instead.
  const color: RatioColor = 'gray';
  const meetsEntryThreshold = decline >= t.value.green;
  const approachingEntryThreshold = !meetsEntryThreshold && decline >= t.value.orange;

  return {
    key: 'drawdown_5y',
    value: result.drawdown,
    unit: 'percent',
    color,
    targetLabel: t.label,
    targetSource: t.source,
    currency: null,
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: {
      high: result.high,
      highDate: result.highDate,
      recoveryNeeded: result.recoveryNeeded,
      decline,
      /** Whether the decline clears the book's entry threshold, as a fact
          rather than a colour. */
      meetsEntryThreshold,
      approachingEntryThreshold,
      pricePoints: ctx.bundle.priceHistory.length,
    },
  };
}

// ---------------------------------------------------------------------------
// 5.19 Market cap
// ---------------------------------------------------------------------------

export function computeMarketCap(ctx: RatioContext): RatioResult {
  const t = ctx.thresholds.marketCap;
  const target = { label: t.label, source: t.source };

  if (ctx.marketCapUsd == null) {
    return gray('market_cap', target, ctx.fxApplied == null ? 'no_fx_rate' : 'missing_data');
  }

  return {
    key: 'market_cap',
    value: ctx.marketCapUsd,
    unit: 'currency',
    color: ctx.marketCapUsd >= t.value.minimumUsd ? 'green' : 'red',
    targetLabel: t.label,
    targetSource: t.source,
    currency: 'USD',
    thresholds: t.value,
    history: [],
    notApplicable: false,
    unavailableReason: null,
    // The native figure travels with the converted one. A page showing
    // "$34.0B" beside a price of "928.70 EUR" states two numbers in two
    // currencies and no relation between them; the reader cannot tell whether
    // the cap was converted, or what it is worth in the currency the shares
    // actually trade in.
    detail: {
      marketCapUsd: ctx.marketCapUsd,
      quoteCurrency: ctx.quoteCurrency,
      quoteToUsd: ctx.quoteToUsd,
      marketCapNative:
        ctx.quoteToUsd != null && ctx.quoteToUsd !== 0 ? ctx.marketCapUsd / ctx.quoteToUsd : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export function computeAllRatios(
  ctx: RatioContext,
  category: GrowthCategory,
): Record<RatioKey, RatioResult> {
  const d = derive(ctx);
  const pe = computePe(ctx, d);

  const results: RatioResult[] = [
    pe,
    computePeg(ctx, d, category, pe),
    computeEvEbit(ctx, d),
    computePFcf(ctx, d),
    computeEarningsQuality(ctx, d),
    computeRoe(ctx),
    computeRoa(ctx, d),
    computeEpsGrowth(ctx, d),
    computeRevenueGrowth(ctx, d),
    computeGrossMargin(ctx, d),
    computeNetMargin(ctx, d),
    computeDebt(ctx, d),
    computeDividendYield(ctx, d),
    computePayoutRatio(ctx, d),
    computeRndAdjustedPe(ctx, d),
    computePs(ctx, d),
    computePb(ctx, d),
    computeInventoryReceivables(ctx, d),
    computeDrawdown(ctx),
    computeMarketCap(ctx),
  ];

  return Object.fromEntries(results.map((r) => [r.key, r])) as Record<RatioKey, RatioResult>;
}
