/**
 * The book's four focus sectors (chapter 2), expressed over FinanceDatabase's
 * GICS-style sector/industry labels.
 *
 * Three levels of rule, most specific wins:
 *   symbol           (specificity 100) — one ticker
 *   sector+industry  (specificity  10)
 *   sector           (specificity   0)
 *
 * Anything unmatched is 'outside_focus'. These rows only seed the
 * `sector_mapping` table; the settings screen edits it from there, so changing
 * a mapping never needs a code change.
 */

export type FocusSector =
  | 'information_technology'
  | 'luxury_consumer'
  | 'entertainment_media'
  | 'financial_services_non_bank'
  | 'outside_focus';

export interface SectorRule {
  symbol?: string;
  sector?: string;
  industry?: string;
  focusSector: FocusSector;
  specificity: number;
  /** True for sectors the book explicitly rules out, so the UI can say why. */
  isExcluded?: boolean;
  /**
   * Payment network or processor. Stays fully in focus, but its balance sheet
   * carries customer settlement balances, so ROA is adjusted and the
   * inventory/receivables check does not apply.
   */
  isPaymentProcessor?: boolean;
  /** Matched the keyword rule automatically and awaits manual confirmation. */
  needsReview?: boolean;
  note?: string;
}

const industryRule = (
  sector: string,
  industry: string,
  focusSector: FocusSector,
  note?: string,
): SectorRule => ({ sector, industry, focusSector, specificity: 10, note });

const symbolRule = (
  symbol: string,
  focusSector: FocusSector,
  note: string,
  isPaymentProcessor = false,
): SectorRule => ({
  symbol,
  focusSector,
  specificity: 100,
  isPaymentProcessor,
  note,
});

const excludedRule = (sector: string, industry: string, note: string): SectorRule => ({
  sector,
  industry,
  focusSector: 'outside_focus',
  specificity: 10,
  isExcluded: true,
  note,
});

export const DEFAULT_SECTOR_RULES: SectorRule[] = [
  // -------------------------------------------------------------------------
  // 1. Information technology
  //    semiconductors and chip equipment, hardware/storage/peripherals, software
  // -------------------------------------------------------------------------
  industryRule(
    'Information Technology',
    'Semiconductors & Semiconductor Equipment',
    'information_technology',
    'Semiconductors and chip-equipment makers (NVDA, ASML, AMD, AVGO, AMAT).',
  ),
  industryRule('Information Technology', 'Software', 'information_technology'),
  industryRule('Information Technology', 'Application Software', 'information_technology'),
  industryRule('Information Technology', 'IT Services', 'information_technology'),
  industryRule(
    'Information Technology',
    'Technology Hardware, Storage & Peripherals',
    'information_technology',
  ),
  industryRule(
    'Information Technology',
    'Electronic Equipment, Instruments & Components',
    'information_technology',
    'Where FinanceDatabase files Apple.',
  ),
  industryRule(
    'Information Technology',
    'Communications Equipment',
    'information_technology',
    'Networking and communications hardware.',
  ),

  // -------------------------------------------------------------------------
  // 2. Luxury goods / consumer discretionary
  //    luxury brands, exclusive fashion, premium consumer, travel and hospitality
  // -------------------------------------------------------------------------
  industryRule(
    'Consumer Discretionary',
    'Textiles, Apparel & Luxury Goods',
    'luxury_consumer',
    'Luxury houses and premium apparel (LVMH, Hermès, Kering, Richemont, Nike).',
  ),
  industryRule(
    'Consumer Discretionary',
    'Hotels, Restaurants & Leisure',
    'luxury_consumer',
    'Travel and hospitality (Booking, Starbucks).',
  ),
  industryRule(
    'Consumer Discretionary',
    'Internet & Direct Marketing Retail',
    'luxury_consumer',
    'Online consumer platforms (Amazon).',
  ),
  industryRule('Consumer Discretionary', 'Leisure Products', 'luxury_consumer'),

  // -------------------------------------------------------------------------
  // 3. Entertainment and interactive media
  //    streaming, social media, search, gaming, digital advertising
  // -------------------------------------------------------------------------
  industryRule(
    'Communication Services',
    'Entertainment',
    'entertainment_media',
    'Streaming and studios (Netflix, Disney).',
  ),
  industryRule('Communication Services', 'Interactive Media & Services', 'entertainment_media'),
  industryRule(
    'Communication Services',
    'Media',
    'entertainment_media',
    'Digital advertising platforms.',
  ),
  industryRule(
    'Communication Services',
    'Diversified Telecommunication Services',
    'entertainment_media',
    'FinanceDatabase files Alphabet and Meta here rather than under Interactive ' +
      'Media, so the industry is in focus. It also holds genuine telcos, which ' +
      'the quantitative filters screen out on growth and margins.',
  ),

  // -------------------------------------------------------------------------
  // 4. Financial services, non-bank
  //    payment networks and processors. Banks and insurers explicitly excluded.
  // -------------------------------------------------------------------------
  industryRule(
    'Financials',
    'Consumer Finance',
    'financial_services_non_bank',
    'Payment networks and card issuers (Visa, Mastercard, PayPal, Amex).',
  ),
  industryRule(
    'Financials',
    'Diversified Financial Services',
    'financial_services_non_bank',
    'Includes payment processors; banks and insurers are excluded separately.',
  ),

  excludedRule('Financials', 'Banks', 'Banks are explicitly outside the book’s focus.'),
  excludedRule(
    'Financials',
    'Thrifts & Mortgage Finance',
    'Banking and mortgage lending, outside the book’s focus.',
  ),
  excludedRule('Financials', 'Insurance', 'Insurers are explicitly outside the book’s focus.'),

  // -------------------------------------------------------------------------
  // Symbol overrides, where the data vendor's label disagrees with the book
  // -------------------------------------------------------------------------
  symbolRule(
    'ADYEN.AS',
    'financial_services_non_bank',
    'FinanceDatabase files Adyen under Information Technology / Software, but ' +
      'the book treats it as a payment processor.',
    true,
  ),
  symbolRule('V', 'financial_services_non_bank', 'Payment network (book, section 4).', true),
  symbolRule('MA', 'financial_services_non_bank', 'Payment network (book, section 4).', true),
  symbolRule('PYPL', 'financial_services_non_bank', 'Payment processor (book, section 4).', true),
  symbolRule(
    'AXP',
    'financial_services_non_bank',
    'Payment network and card issuer (book, section 4).',
    true,
  ),
  symbolRule(
    'EL.PA',
    'luxury_consumer',
    'FinanceDatabase files EssilorLuxottica under Health Care, but the book ' +
      'treats it as a luxury-goods company (Ray-Ban, Oakley).',
  ),
  symbolRule(
    'ROL',
    'outside_focus',
    'FinanceDatabase misfiles Rollins under "Hotels, Restaurants & Leisure", so ' +
      'the industry rule swept a pest-control (commercial services) company into ' +
      'luxury_consumer. It is outside the four focus sectors.',
  ),
];

/**
 * Industries whose members are likely payment processors.
 *
 * A match never tags a company outright — it sets `needsReview`, so the first
 * classification of any company is confirmed by a person. These industries hold
 * plenty of non-processors (consumer lenders, exchanges), and the adjustment
 * changes which ratios are scored, so a false positive is not cheap.
 */
const PAYMENT_KEYWORDS = [/payment/i, /financial data & stock exchanges/i, /transaction/i];

export function looksLikePaymentProcessor(input: {
  industry: string | null;
  name?: string | null;
}): boolean {
  const haystack = `${input.industry ?? ''} ${input.name ?? ''}`;
  return PAYMENT_KEYWORDS.some((pattern) => pattern.test(haystack));
}

/** Resolves the focus sector for one company. Most specific rule wins. */
export function resolveFocusSector(
  rules: SectorRule[],
  input: { symbol: string; sector: string | null; industry: string | null },
): {
  focusSector: FocusSector;
  isExcluded: boolean;
  isPaymentProcessor: boolean;
  rule: SectorRule | null;
} {
  let best: SectorRule | null = null;

  for (const rule of rules) {
    if (rule.symbol) {
      if (rule.symbol.toUpperCase() !== input.symbol.toUpperCase()) continue;
    } else {
      if (rule.sector && rule.sector !== input.sector) continue;
      if (rule.industry && rule.industry !== input.industry) continue;
      if (!rule.sector && !rule.industry) continue;
    }
    if (!best || rule.specificity > best.specificity) best = rule;
  }

  return {
    focusSector: best?.focusSector ?? 'outside_focus',
    isExcluded: best?.isExcluded ?? false,
    isPaymentProcessor: best?.isPaymentProcessor ?? false,
    rule: best,
  };
}

// ---------------------------------------------------------------------------
// Regions — the auto-scan covers US first, Europe second (book, chapter 2)
// ---------------------------------------------------------------------------

const EUROPE = new Set([
  'Netherlands', 'France', 'Germany', 'Switzerland', 'United Kingdom', 'Ireland',
  'Italy', 'Spain', 'Portugal', 'Belgium', 'Luxembourg', 'Austria', 'Denmark',
  'Sweden', 'Norway', 'Finland', 'Iceland', 'Poland', 'Czech Republic', 'Czechia',
  'Hungary', 'Greece', 'Romania', 'Bulgaria', 'Croatia', 'Slovenia', 'Slovakia',
  'Estonia', 'Latvia', 'Lithuania', 'Malta', 'Cyprus', 'Monaco', 'Liechtenstein',
  'Jersey', 'Guernsey', 'Isle of Man', 'Gibraltar', 'Faroe Islands',
]);

export type Region = 'US' | 'Europe' | 'Other';

export function resolveRegion(country: string | null): Region {
  if (!country) return 'Other';
  if (country === 'United States' || country === 'United States of America') return 'US';
  return EUROPE.has(country) ? 'Europe' : 'Other';
}
