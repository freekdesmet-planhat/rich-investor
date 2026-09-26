/**
 * Search floor, instrument exclusion and query folding.
 *
 * The end-to-end cases (KO -> Coca-Cola, hermes -> Hermès) depend on the
 * database, and are verified in a browser; these lock the pure rules those
 * queries are built from — the ones a false positive would quietly break.
 */
import { describe, expect, it } from 'vitest';
import {
  collapseCompanies,
  foldText,
  isExcludedInstrument,
  normaliseQuery,
  passesSizeFloor,
  sizeLabelOf,
} from './searchFilters';

interface L {
  symbol: string;
  name: string | null;
  exchange: string | null;
  country: string | null;
  currency?: string | null;
}
const rep = (rows: L[]) => collapseCompanies(rows).map((r) => r.symbol);

describe('company collapse: representative listing', () => {
  it('keeps the home-country line for a dual listing (ASML.AS over ASML)', () => {
    const out = rep([
      { symbol: 'ASML', name: 'ASML Holding N.V.', exchange: 'NMS', country: 'Netherlands', currency: 'USD' },
      { symbol: 'ASML.AS', name: 'ASML Holding N.V.', exchange: 'AMS', country: 'Netherlands', currency: 'EUR' },
    ]);
    expect(out).toEqual(['ASML.AS']);
  });

  it('with no home line, prefers the EUR line between equal-priority venues (STM.PA over NYSE)', () => {
    const out = rep([
      { symbol: 'STM', name: 'STMicroelectronics N.V.', exchange: 'NYQ', country: 'Switzerland', currency: 'USD' },
      { symbol: 'STM.PA', name: 'STMicroelectronics N.V.', exchange: 'PAR', country: 'Switzerland', currency: 'EUR' },
    ]);
    expect(out).toEqual(['STM.PA']);
  });

  it('does not let a thin EUR cross-listing beat a primary US line (ACN keeps NYSE)', () => {
    const out = rep([
      { symbol: 'ACN', name: 'Accenture plc', exchange: 'NYQ', country: 'Ireland', currency: 'USD' },
      { symbol: 'ACN.F', name: 'Accenture plc', exchange: 'FRA', country: 'Ireland', currency: 'EUR' },
      { symbol: 'ACNW.VI', name: 'Accenture plc', exchange: 'VIE', country: 'Ireland', currency: 'EUR' },
    ]);
    expect(out).toEqual(['ACN']);
  });

  it('collapses share classes and keeps GOOGL', () => {
    const out = rep([
      { symbol: 'GOOG', name: 'Alphabet Inc. Class C Capital Stock', exchange: 'NMS', country: 'United States', currency: 'USD' },
      { symbol: 'GOOGL', name: 'Alphabet Inc. Class A Common Stock', exchange: 'NMS', country: 'United States', currency: 'USD' },
    ]);
    expect(out).toEqual(['GOOGL']);
  });
});

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
  it('admits Large and Mega always, on the band alone', () => {
    expect(passesSizeFloor('Large Cap', null, false)).toBe(true);
    expect(passesSizeFloor('Mega Cap', null, false)).toBe(true);
  });
  it('admits a null band only on an exact ticker match', () => {
    expect(passesSizeFloor(null, null, true)).toBe(true);
    expect(passesSizeFloor(null, null, false)).toBe(false);
  });
  it('never admits Mid/Small on the band, even on an exact match', () => {
    expect(passesSizeFloor('Mid Cap', null, true)).toBe(false);
    expect(passesSizeFloor('Small Cap', null, true)).toBe(false);
  });
  it('lets a real USD cap override the band in both directions (A1c)', () => {
    // A stale "Large cap" label that has since shrunk is dropped on the real
    // figure, not admitted on the label.
    expect(passesSizeFloor('Large Cap', 390_000_000, false)).toBe(false);
    // A real cap at/above the floor admits a name whatever its band says.
    expect(passesSizeFloor('Mid Cap', 25_000_000_000, false)).toBe(true);
    expect(passesSizeFloor(null, 25_000_000_000, false)).toBe(true);
    // Exactly on the line passes.
    expect(passesSizeFloor(null, 10_000_000_000, false)).toBe(true);
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
