/**
 * Auto-scan tests.
 *
 * The scan's hard part is not the maths — that is the ratio engine — but
 * deciding which of 6,797 large-cap rows are actually distinct companies worth
 * a person's attention.
 */
import { describe, expect, it } from 'vitest';
import { dedupeByCompany, isPrimaryListing, DISMISS_DAYS } from './scan';

describe('primary listings', () => {
  it('accepts a listing whose venue country matches the company', () => {
    expect(isPrimaryListing('NMS', 'United States')).toBe(true);
    expect(isPrimaryListing('AMS', 'Netherlands')).toBe(true);
    expect(isPrimaryListing('PAR', 'France')).toBe(true);
    expect(isPrimaryListing('EBS', 'Switzerland')).toBe(true);
  });

  /**
   * These three are what the first live scan actually surfaced: a US company on
   * Frankfurt, a US company on the LSE, and a Norwegian company on the
   * International Order Book.
   */
  it('rejects cross-listings, where the venue country differs', () => {
    expect(isPrimaryListing('FRA', 'United States')).toBe(false);
    expect(isPrimaryListing('LSE', 'United States')).toBe(false);
    expect(isPrimaryListing('IOB', 'Norway')).toBe(false);
    expect(isPrimaryListing('PNK', 'Germany')).toBe(false);
  });

  it('rejects rows missing either side', () => {
    expect(isPrimaryListing(null, 'United States')).toBe(false);
    expect(isPrimaryListing('NMS', null)).toBe(false);
  });
});

describe('one listing per company', () => {
  const listing = (symbol: string, exchange: string, name = 'adidas AG') => ({
    symbol,
    name,
    exchange,
    country: 'Germany',
  });

  /** Adidas on XETRA, Frankfurt and the Frankfurt floor. */
  it('keeps the main venue when a company trades on several at home', () => {
    const kept = dedupeByCompany([
      listing('ADS.F', 'FRA'),
      listing('ADS.DE', 'GER'),
      listing('ADS1.F', 'FRA'),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].symbol).toBe('ADS.DE');
  });

  it('breaks a tie between equal venues on the shorter symbol', () => {
    const kept = dedupeByCompany([listing('ADS1.F', 'FRA'), listing('ADS.F', 'FRA')]);
    expect(kept[0].symbol).toBe('ADS.F');
  });

  it('keeps genuinely different companies apart', () => {
    const kept = dedupeByCompany([
      listing('ADS.DE', 'GER', 'adidas AG'),
      listing('SAP.DE', 'GER', 'SAP SE'),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('treats same-named companies in different countries as different', () => {
    const kept = dedupeByCompany([
      { symbol: 'X.PA', name: 'Example SA', exchange: 'PAR', country: 'France' },
      { symbol: 'X.MI', name: 'Example SA', exchange: 'MIL', country: 'Italy' },
    ]);
    expect(kept).toHaveLength(2);
  });

  it('falls back to the symbol when a name is missing', () => {
    const kept = dedupeByCompany([
      { symbol: 'AAA', name: null, exchange: 'NMS', country: 'United States' },
      { symbol: 'BBB', name: null, exchange: 'NMS', country: 'United States' },
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe('dismissal window', () => {
  it('is the 90 days the book asks for', () => {
    expect(DISMISS_DAYS).toBe(90);
  });
});
