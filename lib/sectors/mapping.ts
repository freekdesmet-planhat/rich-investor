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

  // --- 2026-09-26 focus-universe review: not actually in-focus companies ------
  // Misfiled by FinanceDatabase's industry into a focus sector; each is genuinely
  // outside the four. Symbol rules (specificity 100) override the industry sweep.
  symbolRule('Z', 'outside_focus', 'Zillow — real-estate marketplace, misfiled under Diversified Telecom.'),
  symbolRule('SYM', 'outside_focus', 'Symbotic — warehouse automation (industrials), misfiled under Diversified Financials.'),
  symbolRule('CNM', 'outside_focus', 'Core & Main — water/utility infrastructure distribution, not electronic equipment.'),
  symbolRule('FPS', 'outside_focus', 'Electrical power equipment (industrials), not electronic equipment.'),
  symbolRule('FSLR', 'outside_focus', 'First Solar — solar panels (industrials/energy), not tech hardware.'),
  symbolRule('GEHC', 'outside_focus', 'GE HealthCare — health-care equipment, misfiled under Software.'),
  symbolRule('MSTR', 'outside_focus', 'Strategy (MicroStrategy) — a bitcoin treasury vehicle, not a software business.'),
  symbolRule('NXT', 'outside_focus', 'Nextracker — solar trackers (industrials), not semiconductors.'),
  symbolRule('QXO', 'outside_focus', 'QXO — building-products distribution, misfiled under Software.'),
  symbolRule('SCI', 'outside_focus', 'Service Corp — funeral services, misfiled under Hotels/Restaurants/Leisure.'),

  // Bank-charter holders: consumer-finance names that take deposits. Out of focus,
  // like the banks the book excludes.
  symbolRule('ALLY', 'outside_focus', 'Ally — holds a bank charter (Ally Bank); a bank, out of focus.'),
  symbolRule('SOFI', 'outside_focus', 'SoFi — holds a bank charter (SoFi Bank); a bank, out of focus.'),
  symbolRule('SYF', 'outside_focus', 'Synchrony — holds a bank charter (Synchrony Bank); a bank, out of focus.'),

  // --- 2026-09-26 review: in focus, but under the wrong focus label -----------
  symbolRule('ABNB', 'luxury_consumer', 'Airbnb — travel/hospitality, not entertainment_media.'),
  symbolRule('DASH', 'luxury_consumer', 'DoorDash — consumer delivery, not entertainment_media.'),
  symbolRule('FLUT', 'luxury_consumer', 'Flutter — gaming/leisure operator, filed as luxury_consumer here.'),
  symbolRule('SINCH.ST', 'information_technology', 'Sinch — cloud communications software, not entertainment_media.'),
  symbolRule('TWLO', 'information_technology', 'Twilio — communications APIs (software), not entertainment_media.'),
  symbolRule('ZM', 'information_technology', 'Zoom — communications software, not entertainment_media.'),
  symbolRule('ANET', 'information_technology', 'Arista — networking hardware (IT), not financial services.'),
  symbolRule('FFIV', 'information_technology', 'F5 — application networking (IT), not financial services.'),
  symbolRule('PANW', 'information_technology', 'Palo Alto Networks — security software (IT), not financial services.'),
  symbolRule('TTWO', 'entertainment_media', 'Take-Two — video games (entertainment_media), not financial services.'),
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
