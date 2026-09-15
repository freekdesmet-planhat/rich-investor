/**
 * Telling the reader which parts of a verdict rested on figures that were not
 * there.
 *
 * The distinction that matters: a condition that does not *apply* to this
 * company is not a gap in the data. Counting those would put a warning on every
 * bank on the list and teach the reader to ignore it.
 */
import { describe, expect, it } from 'vitest';
import { dataQualityOf, sourcesForRatio, type QualityCondition } from './dataQuality';

const condition = (
  key: string,
  over: Partial<QualityCondition> = {},
): QualityCondition => ({ key, applicable: true, passed: true, value: 1, ...over });

describe('dataQualityOf', () => {
  it('says nothing when everything was measured', () => {
    const quality = dataQualityOf({ checklist: [condition('pe'), condition('roe')] });

    expect(quality.hasIssues).toBe(false);
    expect(quality.unmeasured).toEqual([]);
  });

  it('names a condition judged without its figure', () => {
    const quality = dataQualityOf({
      checklist: [condition('pe'), condition('debt', { value: null, passed: false })],
    });

    expect(quality.unmeasured).toEqual(['debt']);
    expect(quality.hasIssues).toBe(true);
  });

  /** A rule that does not apply is not missing data; the checklist says so. */
  it('ignores a condition that does not apply to this company', () => {
    const quality = dataQualityOf({
      checklist: [condition('cash_flow', { applicable: false, value: null, passed: false })],
    });

    expect(quality.unmeasured).toEqual([]);
    expect(quality.hasIssues).toBe(false);
  });

  it('flags a condition resting on an approximation', () => {
    const quality = dataQualityOf({
      checklist: [condition('returns', { detail: { roaIsAdjusted: true } })],
    });

    expect(quality.approximated).toEqual(['returns']);
    expect(quality.hasIssues).toBe(true);
  });

  /**
   * Every ticker in the database carries a recoverable "SEC ticker file: HTTP
   * 403" from a coverage check while its figures arrived fine from elsewhere,
   * so the snapshot's error list cannot support the claim that a figure is
   * missing. Only a condition with no value can.
   */
  it('ignores conditions that carry no number by design', () => {
    const quality = dataQualityOf({
      checklist: [
        condition('focus_sector', { value: null }),
        condition('lynch_category', { value: null }),
      ],
    });

    expect(quality.unmeasured).toEqual([]);
    expect(quality.hasIssues).toBe(false);
  });

  it('carries staleness', () => {
    expect(dataQualityOf({ checklist: [], isStale: true })).toMatchObject({
      isStale: true,
      hasIssues: true,
    });
  });

  it('reports several problems at once', () => {
    const quality = dataQualityOf({
      checklist: [
        condition('pe', { value: null }),
        condition('debt', { value: null }),
        condition('returns', { detail: { roaIsAdjusted: true } }),
      ],
    });

    expect(quality.unmeasured).toEqual(['pe', 'debt']);
    expect(quality.approximated).toEqual(['returns']);
  });
});

describe('sourcesForRatio', () => {
  const sources = { income: 'sec-edgar', balance: 'sec-edgar', cashFlow: 'yahoo-finance2' };

  it('names only the statements a ratio actually divides', () => {
    expect(sourcesForRatio('pe', sources)).toEqual(['sec-edgar']);
    expect(sourcesForRatio('p_fcf', sources)).toEqual(['yahoo-finance2']);
  });

  it('collapses duplicates and orders them predictably', () => {
    expect(sourcesForRatio('roe', sources)).toEqual(['sec-edgar']);
    expect(sourcesForRatio('earnings_quality', sources)).toEqual(['sec-edgar', 'yahoo-finance2']);
  });

  /** Vague but never wrong, for a ratio the map has not heard of. */
  it('falls back to every source it knows for an unmapped ratio', () => {
    expect(sourcesForRatio('something_new', sources)).toEqual(['sec-edgar', 'yahoo-finance2']);
  });

  it('has nothing to say without sources', () => {
    expect(sourcesForRatio('pe', null)).toEqual([]);
    expect(sourcesForRatio('pe', { income: null })).toEqual([]);
  });
});
