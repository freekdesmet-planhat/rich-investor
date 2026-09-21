import { describe, expect, it } from 'vitest';
import {
  buildStatementTable,
  INCOME_ROWS,
  STATEMENT_ROWS,
  type StoredPeriod,
} from './statementTable';

const periods: StoredPeriod[] = [
  { endDate: '2023-12-31', metrics: { revenue: 100, netIncome: 10 } },
  { endDate: '2025-12-31', metrics: { revenue: 150, netIncome: 20 } },
  { endDate: '2024-12-31', metrics: { revenue: 120, netIncome: -5 } },
];

const specs = [
  { metric: 'revenue', label: 'Revenue', emphasis: true, growth: true },
  { metric: 'netIncome', label: 'Net income', growth: true },
  { metric: 'ebitda', label: 'EBITDA' },
];

describe('buildStatementTable', () => {
  it('puts the newest period first whatever order it was stored in', () => {
    expect(buildStatementTable(periods, specs).columns).toEqual([
      '2025-12-31',
      '2024-12-31',
      '2023-12-31',
    ]);
  });

  it('lines values up with their columns', () => {
    const table = buildStatementTable(periods, specs);
    expect(table.rows[0]).toMatchObject({ label: 'Revenue', values: [150, 120, 100] });
  });

  it('computes growth against the period to its right', () => {
    const [revenue] = buildStatementTable(periods, specs).rows;
    expect(revenue.growth![0]).toBeCloseTo(0.25, 6); // 150 over 120
    expect(revenue.growth![1]).toBeCloseTo(0.2, 6); // 120 over 100
    // Nothing older to compare the last column against.
    expect(revenue.growth![2]).toBeNull();
  });

  /**
   * "Profit grew 300%" out of a loss is arithmetic, not information, and
   * reads as good news for a company that lost money last year.
   */
  it('refuses growth out of a negative base', () => {
    const netIncome = buildStatementTable(periods, specs).rows[1];
    // 2025's 20 follows 2024's -5.
    expect(netIncome.growth![0]).toBeNull();
    // 2024's -5 follows 2023's 10, which is a real base.
    expect(netIncome.growth![1]).toBeCloseTo(-1.5, 6);
  });

  it('leaves growth off rows that did not ask for it', () => {
    const table = buildStatementTable(
      [{ endDate: '2025-12-31', metrics: { revenue: 1, ebitda: 2 } }],
      specs,
    );
    expect(table.rows.find((r) => r.key === 'ebitda')!.growth).toBeNull();
  });

  /**
   * An empty row of dashes across five years reads as missing data for this
   * company, when it actually means the provider never fills that field.
   */
  it('drops a row no period reports at all', () => {
    const table = buildStatementTable(periods, specs);
    expect(table.rows.map((r) => r.key)).toEqual(['revenue', 'netIncome']);
  });

  it('keeps a row that is present in only one period', () => {
    const sparse: StoredPeriod[] = [
      { endDate: '2025-12-31', metrics: { revenue: 150, ebitda: 40 } },
      { endDate: '2024-12-31', metrics: { revenue: 120 } },
    ];
    const table = buildStatementTable(sparse, specs);
    expect(table.rows.find((r) => r.key === 'ebitda')!.values).toEqual([40, null]);
  });

  it('treats an unusable number as absent', () => {
    const odd: StoredPeriod[] = [
      { endDate: '2025-12-31', metrics: { revenue: Number.NaN, netIncome: 5 } },
    ];
    const table = buildStatementTable(odd, specs);
    expect(table.rows.map((r) => r.key)).toEqual(['netIncome']);
  });

  it('handles having no periods at all', () => {
    expect(buildStatementTable([], specs)).toEqual({ columns: [], rows: [] });
  });
});

describe('the statement layouts', () => {
  it('covers all three statements', () => {
    expect(Object.keys(STATEMENT_ROWS)).toEqual(['income', 'balance', 'cash']);
  });

  it('names each metric once per statement', () => {
    for (const [kind, rows] of Object.entries(STATEMENT_ROWS)) {
      const metrics = rows.map((r) => r.metric);
      expect(new Set(metrics).size, `${kind} repeats a metric`).toBe(metrics.length);
    }
  });

  /** Growth on forty rows is forty percentages nobody reads. */
  it('asks for growth only on the lines whose direction is the story', () => {
    const withGrowth = INCOME_ROWS.filter((r) => r.growth);
    expect(withGrowth.length).toBeLessThanOrEqual(6);
    expect(withGrowth.map((r) => r.metric)).toContain('revenue');
    expect(withGrowth.map((r) => r.metric)).toContain('netIncome');
  });
});
