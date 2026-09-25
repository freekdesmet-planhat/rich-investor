/**
 * SEC EDGAR fundamentals provider (XBRL "company facts").
 *
 * Why this exists: finance-query returns only 4 fiscal years, but the book's
 * rules are written for 5 (section 5). EDGAR returns the full filing history —
 * 14 years for META, 17 for ASML — needs no API key, and is the filings
 * themselves rather than a vendor's reconstruction of them.
 *
 * It also reports an explicit currency unit per fact, which is the only
 * reliable way to learn a company's *filing* currency: finance-query leaves
 * `financialCurrency` null, so ASML (quoted in USD on NasdaqGS, reporting in
 * EUR) otherwise produces price-based ratios that silently mix currencies.
 *
 * Coverage: SEC filers only, which includes foreign issuers filing a 20-F such
 * as ASML, but excludes EU-only listings (Adyen, Hermès, Kering, LVMH,
 * Richemont, EssilorLuxottica). Those fall through to the next provider.
 *
 * Ticker matching is exact and never strips an exchange suffix: EDGAR's ticker
 * file maps `MC` to Moelis, `CFR` to Cullen/Frost and `EL` to Estée Lauder, so
 * treating `MC.PA` as `MC` would analyse an entirely different company.
 */
import {
  type FinancialStatement,
  type FundamentalsProvider,
  type MetricName,
  type StatementFrequency,
  type StatementKind,
  type StatementPeriod,
} from './types';
import { secConfigured } from './secUserAgent';
import { getCik, paddedCik, secFetch, SEC_COMPANY_FACTS } from './sec/edgarClient';

/** Company-facts JSON runs to several megabytes; give it a full minute. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * XBRL concepts per canonical metric, in priority order: the first concept that
 * has a value for a period wins. Companies switch concepts over time (META
 * reports `Revenues` up to 2017 and
 * `RevenueFromContractWithCustomerExcludingAssessedTax` from 2018), so several
 * alternatives per metric are required to get an unbroken series.
 */
const CONCEPTS: Partial<Record<MetricName, string[]>> = {
  // --- income ---
  revenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
  ],
  costOfRevenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfServices', 'CostOfSales'],
  grossProfit: ['GrossProfit'],
  operatingIncome: ['OperatingIncomeLoss'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  pretaxIncome: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  ],
  taxProvision: ['IncomeTaxExpenseBenefit'],
  researchAndDevelopment: ['ResearchAndDevelopmentExpense'],
  sellingGeneralAdmin: [
    'SellingGeneralAndAdministrativeExpense',
    'GeneralAndAdministrativeExpense',
  ],
  operatingExpenses: ['OperatingExpenses', 'CostsAndExpenses'],
  interestExpense: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestIncomeExpenseNet'],
  basicEps: ['EarningsPerShareBasic'],
  dilutedEps: ['EarningsPerShareDiluted'],
  basicShares: ['WeightedAverageNumberOfSharesOutstandingBasic'],
  dilutedShares: ['WeightedAverageNumberOfDilutedSharesOutstanding'],

  // --- balance ---
  totalAssets: ['Assets'],
  totalLiabilities: ['Liabilities'],
  stockholdersEquity: [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  ],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsAndShortTermInvestments'],
  cashAndShortTermInvestments: [
    'CashCashEquivalentsAndShortTermInvestments',
    'CashAndCashEquivalentsAtCarryingValue',
  ],
  currentAssets: ['AssetsCurrent'],
  currentLiabilities: ['LiabilitiesCurrent'],
  inventory: ['InventoryNet'],
  receivables: [
    'AccountsReceivableNetCurrent',
    'ReceivablesNetCurrent',
    'AccountsAndOtherReceivablesNetCurrent',
  ],
  accountsPayable: ['AccountsPayableCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'],
  goodwill: ['Goodwill'],
  retainedEarnings: ['RetainedEarningsAccumulatedDeficit'],
  netPPE: ['PropertyPlantAndEquipmentNet'],
  sharesOutstanding: ['CommonStockSharesOutstanding', 'CommonStockSharesIssued'],
  restrictedCash: [
    'RestrictedCashAndCashEquivalentsAtCarryingValue',
    'RestrictedCashAndCashEquivalentsCurrent',
    'RestrictedCash',
  ],

  // --- cash flow ---
  operatingCashFlow: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ],
  investingCashFlow: [
    'NetCashProvidedByUsedInInvestingActivities',
    'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations',
  ],
  financingCashFlow: [
    'NetCashProvidedByUsedInFinancingActivities',
    'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations',
  ],
  capitalExpenditure: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
  ],
  dividendsPaid: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'],
  repurchaseOfStock: ['PaymentsForRepurchaseOfCommonStock'],
  stockBasedCompensation: ['ShareBasedCompensation'],
  depreciationAndAmortization: [
    'DepreciationDepletionAndAmortization',
    'DepreciationAmortizationAndAccretionNet',
    'DepreciationAndAmortization',
  ],
};

/** Debt has no single XBRL concept; it is summed from its components. */
const DEBT_COMPONENTS = {
  longTerm: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  current: ['LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings'],
} as const;

const METRICS_BY_KIND: Record<StatementKind, MetricName[]> = {
  income: [
    'revenue',
    'costOfRevenue',
    'grossProfit',
    'operatingIncome',
    'netIncome',
    'pretaxIncome',
    'taxProvision',
    'researchAndDevelopment',
    'sellingGeneralAdmin',
    'operatingExpenses',
    'interestExpense',
    'basicEps',
    'dilutedEps',
    'basicShares',
    'dilutedShares',
  ],
  balance: [
    'totalAssets',
    'totalLiabilities',
    'stockholdersEquity',
    'cash',
    'cashAndShortTermInvestments',
    'currentAssets',
    'currentLiabilities',
    'inventory',
    'receivables',
    'accountsPayable',
    'goodwill',
    'retainedEarnings',
    'netPPE',
    'sharesOutstanding',
    'restrictedCash',
  ],
  cash: [
    'operatingCashFlow',
    'investingCashFlow',
    'financingCashFlow',
    'capitalExpenditure',
    'dividendsPaid',
    'repurchaseOfStock',
    'stockBasedCompensation',
    'depreciationAndAmortization',
  ],
};

/** Balance-sheet metrics are instants; the rest are durations. */
const INSTANT_METRICS = new Set<MetricName>(METRICS_BY_KIND.balance);

interface RawFact {
  start?: string;
  end: string;
  val: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
}

interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, RawFact[]> }>>;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class SecEdgarProvider implements FundamentalsProvider {
  readonly name = 'sec-edgar';

  private readonly factsCache = new Map<string, CompanyFacts | null>();

  async covers(symbol: string): Promise<boolean> {
    // A suffixed symbol is a non-US listing; EDGAR indexes US listings only,
    // and the bare ticker almost always belongs to a different company.
    if (symbol.includes('.')) return false;
    // Without a contact address EDGAR refuses the ticker file, so this
    // provider cannot cover anything and the chain moves on.
    if (!secConfigured()) return false;
    return (await getCik(symbol)) !== null;
  }

  private async getFacts(symbol: string): Promise<CompanyFacts | null> {
    const key = symbol.toUpperCase();
    if (this.factsCache.has(key)) return this.factsCache.get(key) ?? null;

    const cik = await getCik(key);
    if (cik === null) {
      this.factsCache.set(key, null);
      return null;
    }

    const response = await secFetch(`${SEC_COMPANY_FACTS}${paddedCik(cik)}.json`, {
      timeoutMs: REQUEST_TIMEOUT_MS,
    });

    // A filer with no XBRL facts (e.g. an ADR of a non-filing issuer) 404s.
    if (!response.ok) {
      this.factsCache.set(key, null);
      return null;
    }

    const facts = (await response.json()) as CompanyFacts;
    this.factsCache.set(key, facts);
    return facts;
  }

  async getStatements(
    symbols: string[],
    kind: StatementKind,
    frequency: StatementFrequency,
  ): Promise<Map<string, FinancialStatement>> {
    const out = new Map<string, FinancialStatement>();

    // EDGAR is an annual-only source here, deliberately.
    //
    // 10-Q filings cover Q1-Q3; the fourth quarter is never filed on its own,
    // it is only implied by the 10-K. So XBRL quarterly facts have a Q4-shaped
    // hole in every year, and summing "the last four quarterly facts" silently
    // skips Q4 and counts an older quarter twice — which moved META's P/E from
    // 24.41 (matching Yahoo's own 24.39) to a wrong 26.12.
    //
    // Deriving Q4 as (annual - Q1 - Q2 - Q3) is possible, but the quote
    // provider already returns five clean consecutive quarters for US listings,
    // so TTM comes from there and EDGAR supplies the deep annual history that
    // the book's 5-year rules need.
    if (frequency === 'quarterly') return out;

    for (const symbol of symbols) {
      let facts: CompanyFacts | null = null;
      try {
        facts = await this.getFacts(symbol);
      } catch {
        continue; // a miss here just falls through to the next provider
      }
      if (!facts) continue;

      const statement = buildStatement(symbol, facts, kind, frequency);
      if (statement && statement.periods.length > 0) out.set(symbol, statement);
    }

    return out;
  }

  /** The company's filing currency, e.g. 'EUR' for ASML. Null when unknown. */
  async getFilingCurrency(symbol: string): Promise<string | null> {
    const facts = await this.getFacts(symbol).catch(() => null);
    if (!facts) return null;

    for (const taxonomy of Object.values(facts.facts)) {
      for (const concept of ['Assets', 'Revenues', 'NetIncomeLoss']) {
        const units = taxonomy[concept]?.units;
        if (!units) continue;
        // Monetary units are ISO codes; per-share units look like 'USD/shares'.
        const currency = Object.keys(units).find((u) => /^[A-Z]{3}$/.test(u));
        if (currency) return currency;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fact selection
// ---------------------------------------------------------------------------

function durationDays(fact: RawFact): number | null {
  if (!fact.start) return null;
  const ms = Date.parse(fact.end) - Date.parse(fact.start);
  return Number.isNaN(ms) ? null : ms / 86_400_000;
}

/**
 * Keeps the facts matching the requested frequency.
 *
 * companyfacts mixes annual and quarterly rows for the same concept, separated
 * only by their period length, so duration is what decides. Instant facts
 * (balance-sheet levels) have no start date and are selected by filing form.
 */
function selectFacts(facts: RawFact[], metric: MetricName, frequency: StatementFrequency) {
  const isInstant = INSTANT_METRICS.has(metric);
  const annualForms = /10-K|20-F|40-F/;

  return facts.filter((fact) => {
    if (!Number.isFinite(fact.val) || !fact.end) return false;

    if (isInstant) {
      if (durationDays(fact) !== null) return false;
      return frequency === 'annual'
        ? Boolean(fact.form && annualForms.test(fact.form))
        : Boolean(fact.form);
    }

    const days = durationDays(fact);
    if (days === null) return false;
    return frequency === 'annual' ? days >= 340 && days <= 400 : days >= 80 && days <= 100;
  });
}

/**
 * Picks one value per period end.
 *
 * Restatements mean the same period appears more than once; the most recently
 * filed version wins, which is the figure the company itself now stands behind.
 */
function pickByPeriod(facts: RawFact[]): Map<string, RawFact> {
  const byEnd = new Map<string, RawFact>();
  for (const fact of facts) {
    const existing = byEnd.get(fact.end);
    if (!existing || (fact.filed ?? '') > (existing.filed ?? '')) byEnd.set(fact.end, fact);
  }
  return byEnd;
}

function buildStatement(
  symbol: string,
  facts: CompanyFacts,
  kind: StatementKind,
  frequency: StatementFrequency,
): FinancialStatement | null {
  const taxonomies = Object.entries(facts.facts).filter(([name]) => name !== 'dei');
  if (taxonomies.length === 0) return null;

  const byPeriod = new Map<string, Partial<Record<MetricName, number>>>();
  let currency: string | undefined;

  /** Resolves one canonical metric from its candidate concepts, in priority order. */
  const collect = (metric: MetricName, concepts: string[]) => {
    for (const concept of concepts) {
      for (const [, taxonomy] of taxonomies) {
        const units = taxonomy[concept]?.units;
        if (!units) continue;

        // Prefer a monetary unit; per-share concepts use 'USD/shares', share
        // counts use 'shares'.
        const unitKey =
          Object.keys(units).find((u) => /^[A-Z]{3}$/.test(u)) ??
          Object.keys(units).find((u) => u.includes('/')) ??
          Object.keys(units)[0];
        if (!unitKey) continue;
        if (/^[A-Z]{3}$/.test(unitKey)) currency ??= unitKey;

        const selected = pickByPeriod(selectFacts(units[unitKey], metric, frequency));
        if (selected.size === 0) continue;

        for (const [end, fact] of selected) {
          const bucket = byPeriod.get(end) ?? {};
          // Earlier concepts in the list win; never overwrite a filled value.
          if (bucket[metric] === undefined) {
            bucket[metric] = fact.val;
            byPeriod.set(end, bucket);
          }
        }
      }
    }
  };

  for (const metric of METRICS_BY_KIND[kind]) {
    const concepts = CONCEPTS[metric];
    if (concepts) collect(metric, concepts);
  }

  if (kind === 'balance') collectDebt(taxonomies, frequency, byPeriod);
  if (kind === 'income') deriveIncomeMetrics(byPeriod);

  const periods: StatementPeriod[] = [...byPeriod.entries()]
    .filter(([, metrics]) => Object.keys(metrics).length > 0)
    .map(([endDate, metrics]) => ({ endDate, metrics }))
    .sort((a, b) => b.endDate.localeCompare(a.endDate));

  if (periods.length === 0) return null;
  return { symbol, kind, frequency, periods, currency };
}

/** totalDebt = long-term + current portion; netDebt = totalDebt - cash. */
function collectDebt(
  taxonomies: Array<[string, Record<string, { units: Record<string, RawFact[]> }>]>,
  frequency: StatementFrequency,
  byPeriod: Map<string, Partial<Record<MetricName, number>>>,
) {
  const sums = new Map<string, { long: number | null; current: number | null }>();

  for (const [part, concepts] of Object.entries(DEBT_COMPONENTS)) {
    for (const concept of concepts) {
      for (const [, taxonomy] of taxonomies) {
        const units = taxonomy[concept]?.units;
        if (!units) continue;
        const unitKey = Object.keys(units).find((u) => /^[A-Z]{3}$/.test(u));
        if (!unitKey) continue;

        for (const [end, fact] of pickByPeriod(
          selectFacts(units[unitKey], 'totalAssets', frequency),
        )) {
          const entry = sums.get(end) ?? { long: null, current: null };
          const key = part as 'longTerm' | 'current';
          const slot = key === 'longTerm' ? 'long' : 'current';
          if (entry[slot] === null) entry[slot] = fact.val;
          sums.set(end, entry);
        }
      }
    }
  }

  for (const [end, { long, current }] of sums) {
    if (long === null && current === null) continue;
    const bucket = byPeriod.get(end) ?? {};
    const total = (long ?? 0) + (current ?? 0);
    bucket.totalDebt ??= total;
    if (bucket.cash !== undefined) bucket.netDebt ??= total - bucket.cash;
    byPeriod.set(end, bucket);
  }
}

/**
 * EBIT and EBITDA are not XBRL concepts, so they are derived the same way the
 * book describes them: EBIT is operating income, EBITDA adds back D&A. Gross
 * profit is filled in from revenue minus cost of revenue when not reported.
 */
function deriveIncomeMetrics(byPeriod: Map<string, Partial<Record<MetricName, number>>>) {
  for (const metrics of byPeriod.values()) {
    if (metrics.grossProfit === undefined && metrics.revenue !== undefined && metrics.costOfRevenue !== undefined) {
      metrics.grossProfit = metrics.revenue - metrics.costOfRevenue;
    }
    if (metrics.ebit === undefined && metrics.operatingIncome !== undefined) {
      metrics.ebit = metrics.operatingIncome;
    }
  }
}

export const secEdgarProvider = new SecEdgarProvider();
