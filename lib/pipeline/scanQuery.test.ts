/**
 * The filters that decide what the scan is even allowed to look at.
 *
 * These build PostgREST strings, so the failure mode is not a wrong number but
 * a malformed query — and a malformed query comes back as an empty page, which
 * reads exactly like "the universe has been exhausted". The cases pinned here
 * are the ones that produced that: a venue code without its country, and a
 * label with a comma in it.
 */
import { describe, expect, it } from 'vitest';
import {
  focusPrefilter,
  focusSectorFilter,
  isPrimaryListing,
  primaryListingFilter,
  quoteFilterValue,
  PRIMARY_EXCHANGES,
} from './scanQuery';
import { DEFAULT_SECTOR_RULES, resolveFocusSector, type SectorRule } from '@/lib/sectors/mapping';

describe('quoteFilterValue', () => {
  it('quotes a label whose comma would otherwise split the filter', () => {
    expect(quoteFilterValue('Textiles, Apparel & Luxury Goods')).toBe(
      '"Textiles, Apparel & Luxury Goods"',
    );
  });

  it('escapes a quote and a backslash rather than closing the string early', () => {
    expect(quoteFilterValue('a"b')).toBe('"a\\"b"');
    expect(quoteFilterValue('a\\b')).toBe('"a\\\\b"');
  });
});

describe('primaryListingFilter', () => {
  /**
   * The bug this replaces: `exchange in (...)` kept FRA, because FRA really is
   * Germany's floor venue — so every US company cross-listed on Frankfurt
   * occupied a slot in the cursor space and was thrown away after arriving.
   */
  it('pairs each venue with its own country, rather than listing venues', () => {
    const filter = primaryListingFilter({ NMS: 'United States', FRA: 'Germany' });

    expect(filter).toBe(
      'and(exchange.eq."NMS",country.eq."United States"),and(exchange.eq."FRA",country.eq."Germany")',
    );
    // A US company on Frankfurt matches neither pair.
    expect(filter).not.toContain('exchange.eq."FRA",country.eq."United States"');
  });

  it('covers every venue the in-memory test accepts', () => {
    const filter = primaryListingFilter();

    for (const [exchange, country] of Object.entries(PRIMARY_EXCHANGES)) {
      expect(isPrimaryListing(exchange, country)).toBe(true);
      expect(filter).toContain(`and(exchange.eq."${exchange}",country.eq."${country}")`);
    }
  });
});

describe('focusPrefilter', () => {
  const rules: SectorRule[] = [
    { sector: 'Information Technology', industry: 'Software', focusSector: 'information_technology', specificity: 10 },
    { sector: 'Energy', industry: 'Oil & Gas', focusSector: 'outside_focus', specificity: 10, isExcluded: true },
    { sector: 'Financials', focusSector: 'financial_services_non_bank', specificity: 0 },
    { symbol: 'V', focusSector: 'financial_services_non_bank', specificity: 100 },
  ];

  it('takes the industry from a sector+industry rule and the sector from a sector-only one', () => {
    expect(focusPrefilter(rules)).toEqual({
      symbols: ['V'],
      sectors: ['Financials'],
      industries: ['Software'],
    });
  });

  it('leaves out excluded and outside-focus rules', () => {
    const { industries, sectors } = focusPrefilter(rules);

    expect(industries).not.toContain('Oil & Gas');
    expect(sectors).not.toContain('Energy');
  });

  /**
   * The property that makes filtering in SQL safe at all: the prefilter must
   * never drop a row the JavaScript would have kept. Checked against the real
   * rule set rather than a fixture, because the real one is what ships.
   */
  it('is a superset of what resolveFocusSector accepts', () => {
    const { symbols, sectors, industries } = focusPrefilter(DEFAULT_SECTOR_RULES);
    const symbolSet = new Set(symbols);
    const sectorSet = new Set(sectors);
    const industrySet = new Set(industries);

    for (const rule of DEFAULT_SECTOR_RULES) {
      const row = {
        symbol: rule.symbol ?? 'TEST',
        sector: rule.sector ?? null,
        industry: rule.industry ?? null,
      };
      if (resolveFocusSector(DEFAULT_SECTOR_RULES, row).focusSector === 'outside_focus') continue;

      const kept =
        symbolSet.has(row.symbol) ||
        (row.sector != null && sectorSet.has(row.sector)) ||
        (row.industry != null && industrySet.has(row.industry));

      expect(kept, `${row.symbol} / ${row.sector} / ${row.industry} would be filtered out`).toBe(true);
    }
  });
});

describe('focusSectorFilter', () => {
  it('joins the three term lists into one disjunction', () => {
    const filter = focusSectorFilter([
      { symbol: 'V', focusSector: 'financial_services_non_bank', specificity: 100 },
      { sector: 'Information Technology', industry: 'Software', focusSector: 'information_technology', specificity: 10 },
    ]);

    expect(filter).toBe('symbol.in.("V"),industry.in.("Software")');
  });

  /**
   * Null, not an empty filter. An empty `or` would match nothing, and a scan
   * that returns no candidates because its rules are misconfigured looks
   * identical to one that has finished the universe.
   */
  it('returns null when no rule could ever put a row in focus', () => {
    expect(focusSectorFilter([])).toBeNull();
    expect(
      focusSectorFilter([
        { sector: 'Energy', industry: 'Oil & Gas', focusSector: 'outside_focus', specificity: 10, isExcluded: true },
      ]),
    ).toBeNull();
  });

  it('produces a filter the real rule set can actually use', () => {
    const filter = focusSectorFilter(DEFAULT_SECTOR_RULES);

    expect(filter).not.toBeNull();
    expect(filter).toContain('industry.in.');
    // Every quoted term is balanced, so the string cannot end mid-value.
    expect((filter!.match(/(?<!\\)"/g) ?? []).length % 2).toBe(0);
  });
});
