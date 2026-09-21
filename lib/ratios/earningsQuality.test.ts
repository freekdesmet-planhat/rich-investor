import { describe, expect, it } from 'vitest';
import { earningsQualityNotes, freeCashFlowOf, type AnnualFigures } from './earningsQuality';

const year = (over: Partial<AnnualFigures> = {}): AnnualFigures => ({
  endDate: '2025-12-31',
  dilutedEps: 10,
  dilutedShares: 1_000,
  revenue: 100_000,
  freeCashFlow: 9_000,
  operatingCashFlow: null,
  capitalExpenditure: null,
  stockBasedCompensation: 1_000,
  ...over,
});

describe('freeCashFlowOf', () => {
  it('prefers the reported figure', () => {
    expect(freeCashFlowOf(year({ freeCashFlow: 500 }))).toBe(500);
  });

  /** Providers disagree on the sign of capex; the magnitude is subtracted. */
  it('derives it the same way whichever sign capex carries', () => {
    const negative = year({ freeCashFlow: null, operatingCashFlow: 900, capitalExpenditure: -300 });
    const positive = year({ freeCashFlow: null, operatingCashFlow: 900, capitalExpenditure: 300 });

    expect(freeCashFlowOf(negative)).toBe(600);
    expect(freeCashFlowOf(positive)).toBe(600);
  });

  it('gives nothing when it cannot be derived', () => {
    expect(freeCashFlowOf(year({ freeCashFlow: null, operatingCashFlow: 900 }))).toBeNull();
  });
});

describe('earningsQualityNotes', () => {
  it('says nothing about a company that converts well and pays in cash', () => {
    expect(earningsQualityNotes([year({ stockBasedCompensation: 1_000 })])).toEqual([]);
  });

  /**
   * The gap condition 8 cannot see. Operating cash flow can cover net income
   * comfortably while capital spending takes most of it, leaving little of
   * the reported profit as cash an owner could take out.
   */
  it('flags earnings that do not convert to free cash flow', () => {
    // EPS 10, FCF per share 4 — 40% conversion.
    const notes = earningsQualityNotes([year({ freeCashFlow: 4_000 })]);
    const note = notes.find((n) => n.key === 'cashConversion')!;

    expect(note.values.percent).toBe(40);
    expect(note.values.fcfPerShare).toBe(4);
    expect(note.severity).toBe(1);
  });

  it('treats very poor conversion as the more serious note', () => {
    const notes = earningsQualityNotes([year({ freeCashFlow: 2_000 })]);
    expect(notes.find((n) => n.key === 'cashConversion')!.severity).toBe(2);
  });

  /** A P/E out of a loss is condition 8's business; this ratio reads backwards. */
  it('does not judge conversion against a loss', () => {
    const notes = earningsQualityNotes([year({ dilutedEps: -3, freeCashFlow: 1_000 })]);
    expect(notes.find((n) => n.key === 'cashConversion')).toBeUndefined();
  });

  it('flags stock compensation as a share of revenue', () => {
    const notable = earningsQualityNotes([year({ stockBasedCompensation: 6_000 })]);
    expect(notable.find((n) => n.key === 'stockComp')).toMatchObject({
      severity: 1,
      values: { percent: 6 },
    });

    const high = earningsQualityNotes([year({ stockBasedCompensation: 15_000 })]);
    expect(high.find((n) => n.key === 'stockComp')).toMatchObject({
      severity: 2,
      values: { percent: 15 },
    });
  });

  it('says nothing about stock comp it was not given', () => {
    const notes = earningsQualityNotes([year({ stockBasedCompensation: null })]);
    expect(notes.find((n) => n.key === 'stockComp')).toBeUndefined();
  });

  /**
   * The share count is the denominator under every per-share figure the
   * checklist reads, so earnings can grow while earnings per share do not.
   */
  it('flags a rising diluted share count', () => {
    const notes = earningsQualityNotes([
      year({ endDate: '2025-12-31', dilutedShares: 1_200 }),
      year({ endDate: '2021-12-31', dilutedShares: 1_000 }),
    ]);
    const note = notes.find((n) => n.key === 'dilution')!;

    expect(note.values.years).toBe(4);
    expect(note.values.total).toBe(20);
    expect(note.values.percent).toBeCloseTo(4.7, 1);
  });

  it('says nothing about a company buying its own shares back', () => {
    const notes = earningsQualityNotes([
      year({ endDate: '2025-12-31', dilutedShares: 800 }),
      year({ endDate: '2021-12-31', dilutedShares: 1_000 }),
    ]);
    expect(notes.find((n) => n.key === 'dilution')).toBeUndefined();
  });

  it('puts the more serious notes first', () => {
    const notes = earningsQualityNotes([
      year({ endDate: '2025-12-31', freeCashFlow: 6_500, stockBasedCompensation: 20_000 }),
      year({ endDate: '2021-12-31', dilutedShares: 1_000 }),
    ]);
    expect(notes.map((n) => n.severity)).toEqual([...notes.map((n) => n.severity)].sort((a, b) => b - a));
    expect(notes[0].key).toBe('stockComp');
  });

  it('survives an empty history', () => {
    expect(earningsQualityNotes([])).toEqual([]);
  });
});
