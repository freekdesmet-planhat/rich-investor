/**
 * Search floor, instrument exclusion and query folding.
 *
 * The end-to-end cases (KO -> Coca-Cola, hermes -> Hermès) depend on the
 * database, and are verified in a browser; these lock the pure rules those
 * queries are built from — the ones a false positive would quietly break.
 */
import { describe, expect, it } from 'vitest';
import {
  foldText,
  isExcludedInstrument,
  normaliseQuery,
  passesSizeFloor,
  sizeLabelOf,
} from './searchFilters';

describe('query folding', () => {
  it('folds diacritics so "hermes" can match "Hermès"', () => {
    expect(foldText('Hermès International')).toBe('hermes international');
    expect(normaliseQuery('hermes')?.folded).toBe('hermes');
  });

  it('treats spaces and hyphens the same', () => {
    const variants = ['coca cola', 'coca-cola', 'Coca Cola', 'COCA  COLA'];
    for (const v of variants) {
      const n = normaliseQuery(v);
      expect(n?.folded).toBe('coca cola');
      expect(n?.pattern).toBe('*coca*cola*'); // spans the gap either way
    }
  });

  it('keeps a symbol candidate uppercased with its dots and dashes', () => {
    expect(normaliseQuery('asml.as')?.symbol).toBe('ASML.AS');
    expect(normaliseQuery('ko')?.symbol).toBe('KO');
  });

  it('rejects a query under two characters', () => {
    expect(normaliseQuery('a')).toBeNull();
    expect(normaliseQuery(' ')).toBeNull();
  });
});

describe('size floor', () => {
  it('admits Large and Mega always', () => {
    expect(passesSizeFloor('Large Cap', false)).toBe(true);
    expect(passesSizeFloor('Mega Cap', false)).toBe(true);
  });
  it('admits a null band only on an exact ticker match', () => {
    expect(passesSizeFloor(null, true)).toBe(true);
    expect(passesSizeFloor(null, false)).toBe(false);
  });
  it('never admits Mid/Small, even on an exact match', () => {
    expect(passesSizeFloor('Mid Cap', true)).toBe(false);
    expect(passesSizeFloor('Small Cap', true)).toBe(false);
  });
  it('labels the null-band rescue as checked-on-analysis', () => {
    expect(sizeLabelOf(null)).toBe('checkedOnAnalysis');
    expect(sizeLabelOf('Large Cap')).toBe('large');
    expect(sizeLabelOf('Mega Cap')).toBe('mega');
    expect(sizeLabelOf('Mid Cap')).toBe(null);
  });
});

describe('instrument exclusion', () => {
  const drop = (name: string, symbol = 'XXX') => isExcludedInstrument(name, symbol);

  it('drops warrants, rights, units, preferred series and structured products', () => {
    expect(drop('Expand Energy Corporation Class A Warrants')).toBe(true);
    expect(drop('Acme Corp Rights')).toBe(true);
    expect(drop('SPAC Acquisition Corp Units')).toBe(true);
    expect(drop('Bank of America 6% Preferred Stock Series K')).toBe(true);
    expect(drop('Some Co Cumulative Preferred')).toBe(true);
    expect(drop('Deutsche Bank Optionsschein auf SAP')).toBe(true);
    expect(drop('Vontobel Turbo Long Apple')).toBe(true);
    expect(drop('BNP Mini Future on Adyen')).toBe(true);
    expect(drop('Knock-Out Call on ASML')).toBe(true);
    expect(drop('Leverage Shares 3x Shopify ETP')).toBe(true);
    expect(drop('iShares Core S&P 500 ETF')).toBe(true);
  });

  it('drops instruments by symbol suffix and test tickers', () => {
    expect(drop('', 'ALTG-WT')).toBe(true);
    expect(drop('', 'COF-PG')).toBe(true);
    expect(drop('', 'AONE-UN')).toBe(true);
    expect(drop('', 'GUT-RI')).toBe(true);
    expect(drop('', 'ZJZZT')).toBe(true);
    expect(drop('', 'ATEST-C')).toBe(true);
    expect(drop('', 'NTEST')).toBe(true);
  });

  it('keeps real companies that merely contain a keyword', () => {
    expect(drop('Unity Software Inc.', 'U')).toBe(false);
    expect(drop('Preferred Bank', 'PFBC')).toBe(false);
    expect(drop('Ascentage Pharma Group American Depositary Shares', 'AAPG')).toBe(false);
    expect(drop('Coca-Cola Company', 'KO')).toBe(false);
    expect(drop('Rollins, Inc.', 'ROL')).toBe(false);
    expect(drop('AutoZone, Inc.', 'AZO')).toBe(false);
  });
});
