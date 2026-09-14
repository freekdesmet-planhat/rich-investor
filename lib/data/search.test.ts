/**
 * Search result ordering.
 *
 * These are the real rows from the universe table for each case, because the
 * ordering only went wrong on shapes that looked reasonable in the abstract:
 * a company listed outside its own country, and instruments named after the
 * company they track.
 */
import { describe, expect, it } from 'vitest';
import { rankUniverseMatches, type RankableListing } from './rankMatches';

const row = (symbol: string, name: string, exchange: string, country: string): RankableListing => ({
  symbol,
  name,
  exchange,
  country,
});

describe('ranking matches', () => {
  /**
   * The case that caught it. Every leveraged ETP is domiciled where it trades,
   * so isPrimaryListing() says true for all of them; Shopify is Canadian and
   * trades in New York, so it says false. Ranking on that alone put four
   * derivatives above the company.
   */
  it('puts the company above instruments written on it', () => {
    const ranked = rankUniverseMatches(
      [
        row('SHOS.L', 'Leverage Shares -1x Short Shopify ETP', 'LSE', 'United Kingdom'),
        row('SHO3.L', 'Leverage Shares 3x Shopify ETP', 'LSE', 'United Kingdom'),
        row('SHOP', 'Shopify Inc.', 'NYQ', 'Canada'),
        row('SHO3.PA', 'LS 3X SHOPIFY', 'PAR', 'France'),
      ],
      'shopify',
    );

    expect(ranked[0].symbol).toBe('SHOP');
  });

  it('puts an exact ticker match first, whatever else matches', () => {
    const ranked = rankUniverseMatches(
      [
        row('0R2Y.L', 'ADOBE SYSTEMS INC ADOBE SYSTEM', 'LSE', 'United States'),
        row('ADBE', 'Adobe Inc.', 'NMS', 'United States'),
      ],
      'adbe',
    );

    expect(ranked[0].symbol).toBe('ADBE');
  });

  /**
   * ASML is a Dutch company on NASDAQ, so the exchange/country test is false
   * for it. It must still win against a Brazilian depositary receipt.
   */
  it('does not punish a company for listing abroad', () => {
    const ranked = rankUniverseMatches(
      [
        row('ASML34.SA', 'ASML HOLD   DRN', 'SAO', 'Netherlands'),
        row('ASML', 'ASML Holding N.V.', 'NMS', 'Netherlands'),
      ],
      'asml',
    );

    expect(ranked[0].symbol).toBe('ASML');
  });

  it('prefers a name that starts with the query over one that merely contains it', () => {
    const ranked = rankUniverseMatches(
      [
        row('X1', 'Global Bank Holdings', 'LSE', 'United Kingdom'),
        row('X2', 'Bank of Ireland', 'ISE', 'Ireland'),
      ],
      'bank',
    );

    expect(ranked[0].symbol).toBe('X2');
  });

  it('still returns derivatives, just below the real listings', () => {
    const ranked = rankUniverseMatches(
      [
        row('SHOS.L', 'Leverage Shares -1x Short Shopify ETP', 'LSE', 'United Kingdom'),
        row('SHOP', 'Shopify Inc.', 'NYQ', 'Canada'),
      ],
      'shopify',
    );

    expect(ranked).toHaveLength(2);
    expect(ranked.map((r) => r.symbol)).toEqual(['SHOP', 'SHOS.L']);
  });

  it('is stable enough to break ties on the shorter name', () => {
    const ranked = rankUniverseMatches(
      [
        row('A1', 'Adobe Systems Incorporated Worldwide', 'NMS', 'United States'),
        row('A2', 'Adobe Inc.', 'NMS', 'United States'),
      ],
      'adobe',
    );

    expect(ranked[0].symbol).toBe('A2');
  });

  it('leaves an empty list alone', () => {
    expect(rankUniverseMatches([], 'anything')).toEqual([]);
  });
});
