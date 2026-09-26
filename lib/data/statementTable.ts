/**
 * Turning stored statement periods into a table you can read down.
 *
 * The default stock page deliberately shows almost none of this: the ground
 * rules keep it to the verdict, the chart, the thesis and the review. The
 * full statements live one click away, and *there* density is the point —
 * a financial statement read four numbers at a time is not a financial
 * statement.
 *
 * Pure. The shaping is all here so the layouts can be tested without a
 * database or a browser, and the component stays a renderer.
 */

export type ValueFormat = 'currency' | 'number' | 'percent' | 'perShare';

export interface StatementRowSpec {
  /** Metric name as stored on the period. */
  metric: string;
  label: string;
  format?: ValueFormat;
  /** Draws the row as a subtotal: revenue, net income, total assets. */
  emphasis?: boolean;
  /**
   * Adds a year-on-year growth row underneath, revealed on expand.
   *
   * Only worth it for the handful of lines whose direction is the story.
   * Growth on every row would be forty percentages nobody reads.
   */
  growth?: boolean;
  /** Indents under the line above, for a component of a subtotal. */
  indent?: boolean;
}

export interface StatementRow {
  key: string;
  label: string;
  format: ValueFormat;
  emphasis: boolean;
  indent: boolean;
  /** Newest period first, matching the column order. */
  values: Array<number | null>;
  /** Year-on-year change, when the spec asked for it and it is computable. */
  growth: Array<number | null> | null;
}

export interface StatementTable {
  /** Period end dates, oldest first — time runs left to right (round 2, item 2). */
  columns: string[];
  rows: StatementRow[];
}

export interface StoredPeriod {
  endDate: string;
  metrics: Record<string, number | null | undefined>;
}

/**
 * Growth against the period to the right, which is the older one.
 *
 * Null wherever it cannot be computed rather than zero: a missing prior
 * period and a flat year are different facts, and a column of zeros would
 * assert the second when it means the first. Growth out of a negative base
 * is also null — "profit grew 300%" from a loss is arithmetic, not
 * information.
 */
function growthSeries(values: Array<number | null>): Array<number | null> {
  return values.map((value, i) => {
    // The older period is the one to the left now that time runs left to right
    // (round 2, item 2), so growth is measured against the previous column.
    const previous = values[i - 1];
    if (value == null || previous == null || previous <= 0) return null;
    return value / previous - 1;
  });
}

/**
 * Builds one statement's table.
 *
 * Rows whose metric is absent from every period are dropped entirely. A
 * provider that does not report, say, EBITDA should leave no trace: an empty
 * row of dashes across five years looks like missing data for this company
 * rather than a field this source never fills.
 */
export function buildStatementTable(
  periods: StoredPeriod[],
  specs: StatementRowSpec[],
): StatementTable {
  // Oldest first, so time runs left to right like the charts (round 2, item 2).
  const ordered = [...periods].sort((a, b) => a.endDate.localeCompare(b.endDate));
  const columns = ordered.map((p) => p.endDate);

  const rows: StatementRow[] = [];

  for (const spec of specs) {
    const values = ordered.map((p) => {
      const raw = p.metrics?.[spec.metric];
      return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
    });

    if (values.every((v) => v === null)) continue;

    rows.push({
      key: spec.metric,
      label: spec.label,
      format: spec.format ?? 'currency',
      emphasis: spec.emphasis ?? false,
      indent: spec.indent ?? false,
      values,
      growth: spec.growth ? growthSeries(values) : null,
    });
  }

  return { columns, rows };
}

/**
 * The three statements' layouts.
 *
 * Ordered the way the statements themselves are, top to bottom, so somebody
 * who has read one before can find their place. Labels are English here and
 * translated at the edge; the metric names are the app's canonical ones.
 */
export const INCOME_ROWS: StatementRowSpec[] = [
  { metric: 'revenue', label: 'Revenue', emphasis: true, growth: true },
  { metric: 'costOfRevenue', label: 'Cost of revenue', indent: true },
  { metric: 'grossProfit', label: 'Gross profit', emphasis: true, growth: true },
  { metric: 'researchAndDevelopment', label: 'Research and development', indent: true },
  { metric: 'sellingGeneralAdmin', label: 'Selling, general and administrative', indent: true },
  { metric: 'operatingExpenses', label: 'Operating expenses', indent: true },
  { metric: 'operatingIncome', label: 'Operating income', emphasis: true, growth: true },
  { metric: 'ebitda', label: 'EBITDA' },
  { metric: 'ebit', label: 'EBIT' },
  { metric: 'interestExpense', label: 'Interest expense', indent: true },
  { metric: 'interestIncome', label: 'Interest income', indent: true },
  { metric: 'pretaxIncome', label: 'Pre-tax income' },
  { metric: 'taxProvision', label: 'Tax', indent: true },
  { metric: 'netIncome', label: 'Net income', emphasis: true, growth: true },
  { metric: 'dilutedEps', label: 'Diluted EPS', format: 'perShare', growth: true },
  { metric: 'basicEps', label: 'Basic EPS', format: 'perShare' },
  { metric: 'dilutedShares', label: 'Diluted shares', format: 'number' },
];

export const BALANCE_ROWS: StatementRowSpec[] = [
  { metric: 'cash', label: 'Cash' },
  { metric: 'cashAndShortTermInvestments', label: 'Cash and short-term investments' },
  { metric: 'receivables', label: 'Receivables', indent: true },
  { metric: 'inventory', label: 'Inventory', indent: true },
  { metric: 'currentAssets', label: 'Current assets', emphasis: true },
  { metric: 'netPPE', label: 'Property, plant and equipment', indent: true },
  { metric: 'goodwill', label: 'Goodwill', indent: true },
  { metric: 'totalAssets', label: 'Total assets', emphasis: true, growth: true },
  { metric: 'accountsPayable', label: 'Accounts payable', indent: true },
  { metric: 'currentLiabilities', label: 'Current liabilities', emphasis: true },
  { metric: 'totalDebt', label: 'Total debt' },
  { metric: 'netDebt', label: 'Net debt' },
  { metric: 'totalLiabilities', label: 'Total liabilities', emphasis: true },
  { metric: 'retainedEarnings', label: 'Retained earnings', indent: true },
  { metric: 'stockholdersEquity', label: "Shareholders' equity", emphasis: true, growth: true },
  { metric: 'workingCapital', label: 'Working capital' },
  { metric: 'investedCapital', label: 'Invested capital' },
  { metric: 'tangibleBookValue', label: 'Tangible book value' },
];

export const CASH_ROWS: StatementRowSpec[] = [
  { metric: 'operatingCashFlow', label: 'Operating cash flow', emphasis: true, growth: true },
  { metric: 'depreciationAndAmortization', label: 'Depreciation and amortisation', indent: true },
  { metric: 'stockBasedCompensation', label: 'Stock-based compensation', indent: true },
  { metric: 'changeInReceivables', label: 'Change in receivables', indent: true },
  { metric: 'changeInInventory', label: 'Change in inventory', indent: true },
  { metric: 'capitalExpenditure', label: 'Capital expenditure', indent: true },
  { metric: 'freeCashFlow', label: 'Free cash flow', emphasis: true, growth: true },
  { metric: 'investingCashFlow', label: 'Investing cash flow' },
  { metric: 'financingCashFlow', label: 'Financing cash flow' },
  { metric: 'dividendsPaid', label: 'Dividends paid', indent: true },
  { metric: 'repurchaseOfStock', label: 'Share repurchases', indent: true },
];

export const STATEMENT_ROWS = {
  income: INCOME_ROWS,
  balance: BALANCE_ROWS,
  cash: CASH_ROWS,
} as const;

export type StatementKind = keyof typeof STATEMENT_ROWS;
export type StatementPeriodicity = 'annual' | 'quarterly';
