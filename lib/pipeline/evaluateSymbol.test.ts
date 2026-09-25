/**
 * The single evaluation path both pipelines run.
 *
 * These two cases guard the reason this function exists: that the nightly
 * watchlist and the universe scan can no longer disagree about a symbol, and
 * that both honour the household's threshold overrides — the bug where the scan
 * judged against the app defaults while the watchlist did not.
 */
import { describe, expect, it } from 'vitest';
import { evaluateSymbol, type EvaluateSymbolInput } from './evaluateSymbol';
import { createFxRates } from '@/lib/providers/fx';
import { DEFAULT_THRESHOLDS, mergeThresholds } from '@/lib/ratios/thresholds';
import type { SectorRule } from '@/lib/sectors/mapping';
import type { SymbolBundle } from '@/lib/providers/marketData';
import type {
  FinancialStatement,
  MetricName,
  StatementFrequency,
  StatementKind,
} from '@/lib/providers/types';

function statement(
  kind: StatementKind,
  frequency: StatementFrequency,
  periods: Array<[string, Partial<Record<MetricName, number>>]>,
): FinancialStatement {
  return {
    symbol: 'TEST',
    kind,
    frequency,
    periods: periods
      .map(([endDate, metrics]) => ({ endDate, metrics }))
      .sort((a, b) => b.endDate.localeCompare(a.endDate)),
  };
}

function bundle(price = 120): SymbolBundle {
  // Trailing EPS of 5 → at price 120 the P/E is 24: green under the book's
  // ceiling of 30, orange once the ceiling is tightened below 24.
  const income = statement('income', 'annual', [
    ['2025-12-31', { dilutedEps: 5, revenue: 1_000_000_000, netIncome: 200_000_000 }],
    ['2024-12-31', { dilutedEps: 4, revenue: 900_000_000, netIncome: 170_000_000 }],
  ]);
  return {
    symbol: 'TEST',
    asOf: '2026-09-25',
    quote: {
      symbol: 'TEST',
      name: 'Test Co',
      price,
      currency: 'USD',
      marketCap: 100_000_000_000,
      previousClose: null,
      open: null,
      dayHigh: null,
      dayLow: null,
      volume: null,
      exchange: null,
      sector: 'Information Technology',
      industry: 'Software',
      nextEarningsDate: null,
      beta: null,
      dividendPerShare: null,
      employees: null,
      description: null,
    },
    statements: {
      income: { annual: income, quarterly: null },
      balance: { annual: null, quarterly: null },
      cash: { annual: null, quarterly: null },
    },
    priceHistory: [],
    estimates: null,
    filingCurrency: 'USD',
    statementSources: { income: 'test', balance: 'test', cash: 'test' },
    estimatesSource: null,
    isStale: false,
    staleAsOf: null,
    errors: [],
  };
}

const rules: SectorRule[] = [
  { symbol: 'TEST', focusSector: 'information_technology', specificity: 100 },
];

function input(overrides: Partial<EvaluateSymbolInput> = {}): EvaluateSymbolInput {
  return {
    symbol: 'TEST',
    name: 'Test Co',
    sector: 'Information Technology',
    industry: 'Software',
    bundle: bundle(),
    rules,
    thresholds: DEFAULT_THRESHOLDS,
    fx: createFxRates(),
    asOf: '2026-09-25',
    previousStatus: null,
    ...overrides,
  };
}

const peColor = (rows: Record<string, unknown>[]) =>
  rows.find((r) => r.ratio_key === 'pe')?.color;

describe('evaluateSymbol — one path for both pipelines', () => {
  it('produces identical ratio and signal rows for the same input and thresholds', () => {
    // The watchlist and the scan build this same input from a universe row and
    // a candidate row respectively; given the same symbol, bundle, rules and
    // thresholds they must produce byte-identical DB rows.
    const nightly = evaluateSymbol(input());
    const scan = evaluateSymbol(input());

    expect(scan.ratioRows).toEqual(nightly.ratioRows);
    expect(scan.signalRow).toEqual(nightly.signalRow);
    // And the twenty ratios really were computed, not an empty pass.
    expect(nightly.ratioRows.length).toBeGreaterThan(10);
  });

  it('lets a customised threshold change the scan output (the bug fix)', () => {
    const atDefaults = evaluateSymbol(input({ thresholds: DEFAULT_THRESHOLDS }));

    // Tighten the P/E ceiling below this company's 24. The scan now runs on the
    // household's thresholds, so this must move the P/E off green — where before
    // the fix the scan always judged against the app default of 30.
    const tightened = mergeThresholds({ pe: { green: 20, orange: 40 } });
    const atOverride = evaluateSymbol(input({ thresholds: tightened }));

    expect(peColor(atDefaults.ratioRows)).toBe('green');
    expect(peColor(atOverride.ratioRows)).toBe('orange');
    expect(atOverride.ratioRows).not.toEqual(atDefaults.ratioRows);
    // The stored thresholds travel with the signal row, so a historical signal
    // keeps the numbers it was judged against.
    expect(atOverride.signalRow.thresholds_used).toBe(tightened);
  });
});
