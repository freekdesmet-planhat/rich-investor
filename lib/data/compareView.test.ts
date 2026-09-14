/**
 * Putting names side by side.
 *
 * The load-bearing case is "differs": a row where everybody passes is noise,
 * and a row where one ticker simply has no such condition is not a
 * disagreement. Getting either wrong would highlight the rows that do not
 * matter and hide the ones that do.
 */
import { describe, expect, it } from 'vitest';
import {
  compareHref,
  compareRows,
  differingRows,
  parseCompared,
  toggleCompared,
  type ComparableEntry,
} from './compareView';

const condition = (key: string, passed: boolean, applicable = true) => ({
  key,
  applicable,
  passed,
  value: 1,
  target: '≤ 1',
});

const entry = (symbol: string, conditions: ReturnType<typeof condition>[]): ComparableEntry => ({
  symbol,
  name: `${symbol} Inc.`,
  signal: {
    status: 'almost',
    conditions_met: conditions.filter((c) => c.passed).length,
    conditions_applicable: conditions.filter((c) => c.applicable).length,
    checklist: conditions,
  },
});

describe('parseCompared', () => {
  const allowed = ['ADBE', 'GOOGL', 'MSFT', 'NVDA'];

  it('keeps the order asked for', () => {
    expect(parseCompared(['MSFT', 'ADBE'], allowed)).toEqual(['MSFT', 'ADBE']);
  });

  it('normalises case', () => {
    expect(parseCompared(['adbe'], allowed)).toEqual(['ADBE']);
  });

  /** A URL is edited and shared; an unknown ticker must not become a column. */
  it('drops anything not on the watchlist', () => {
    expect(parseCompared(['ADBE', 'ZZZZ'], allowed)).toEqual(['ADBE']);
  });

  it('collapses duplicates', () => {
    expect(parseCompared(['ADBE', 'ADBE'], allowed)).toEqual(['ADBE']);
  });

  it('caps the comparison', () => {
    expect(parseCompared(['ADBE', 'GOOGL', 'MSFT', 'NVDA'], allowed)).toEqual([
      'ADBE',
      'GOOGL',
      'MSFT',
    ]);
  });

  it('copes with nothing asked for', () => {
    expect(parseCompared([], allowed)).toEqual([]);
  });
});

describe('compareRows', () => {
  it('lines the same condition up across tickers', () => {
    const rows = compareRows([
      entry('A', [condition('peg', true), condition('debt', false)]),
      entry('B', [condition('peg', false), condition('debt', false)]),
    ]);

    expect(rows.map((r) => r.key)).toEqual(['peg', 'debt']);
    expect(rows[0].cells.map((c) => c.symbol)).toEqual(['A', 'B']);
    expect(rows[0].cells.map((c) => c.condition?.passed)).toEqual([true, false]);
  });

  it('marks only the rows where they disagree', () => {
    const rows = compareRows([
      entry('A', [condition('peg', true), condition('debt', false)]),
      entry('B', [condition('peg', false), condition('debt', false)]),
    ]);

    expect(rows.find((r) => r.key === 'peg')!.differs).toBe(true);
    expect(rows.find((r) => r.key === 'debt')!.differs).toBe(false);
    expect(differingRows(rows).map((r) => r.key)).toEqual(['peg']);
  });

  /** A bank having no EV/EBIT is not a disagreement about the company. */
  it('does not count a condition that does not apply as a disagreement', () => {
    const rows = compareRows([
      entry('BANK', [condition('ev_ebit', false, false)]),
      entry('TECH', [condition('ev_ebit', true)]),
    ]);
    expect(rows[0].differs).toBe(false);
  });

  it('leaves a gap where a ticker has no evaluation at all', () => {
    const rows = compareRows([
      entry('A', [condition('peg', true)]),
      { symbol: 'NEW', name: 'New Inc.', signal: null },
    ]);
    expect(rows[0].cells[1].condition).toBeNull();
    expect(rows[0].differs).toBe(false);
  });

  it('takes the row order from the checklist itself', () => {
    const rows = compareRows([entry('A', [condition('debt', true), condition('peg', true)])]);
    expect(rows.map((r) => r.key)).toEqual(['debt', 'peg']);
  });

  it('has nothing to compare when nothing was chosen', () => {
    expect(compareRows([])).toEqual([]);
  });
});

describe('toggleCompared', () => {
  it('adds a name that is not in the comparison', () => {
    expect(toggleCompared(['ADBE'], 'MSFT')).toEqual(['ADBE', 'MSFT']);
  });

  it('takes one out again', () => {
    expect(toggleCompared(['ADBE', 'MSFT'], 'ADBE')).toEqual(['MSFT']);
  });

  /** A fourth choice must not silently do nothing to a full comparison. */
  it('refuses to exceed the cap', () => {
    expect(toggleCompared(['A', 'B', 'C'], 'D')).toEqual(['A', 'B', 'C']);
  });

  it('still removes from a full comparison', () => {
    expect(toggleCompared(['A', 'B', 'C'], 'B')).toEqual(['A', 'C']);
  });
});

describe('compareHref', () => {
  it('carries each symbol', () => {
    expect(compareHref(['ADBE', 'MSFT'])).toBe('/compare?symbols=ADBE&symbols=MSFT');
  });

  it('is the bare page with nothing chosen', () => {
    expect(compareHref([])).toBe('/compare');
  });

  it('escapes a ticker with a suffix', () => {
    expect(compareHref(['ADYEN.AS'])).toContain('ADYEN.AS');
  });
});
