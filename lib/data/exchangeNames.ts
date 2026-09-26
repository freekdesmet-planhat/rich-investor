/**
 * Human-readable names for the venue codes the dataset stores.
 *
 * The provider gives a stock's exchange as a terse MIC-ish code ("AMS", "NMS").
 * "Price: close of Thu 24 Sep (AMS)" tells a beginner nothing; "(Euronext
 * Amsterdam)" tells them where it trades. These are proper nouns — the same in
 * every language — so they live in code, not in the message files.
 */
export const EXCHANGE_NAMES: Record<string, string> = {
  // United States
  NMS: 'Nasdaq',
  NGM: 'Nasdaq',
  NYQ: 'NYSE',
  ASE: 'NYSE American',
  PCX: 'NYSE Arca',
  // Euronext
  AMS: 'Euronext Amsterdam',
  PAR: 'Euronext Paris',
  BRU: 'Euronext Brussels',
  LIS: 'Euronext Lisbon',
  ISE: 'Euronext Dublin',
  // Rest of Europe
  EBS: 'SIX Swiss Exchange',
  GER: 'Xetra',
  FRA: 'Frankfurt Stock Exchange',
  MIL: 'Borsa Italiana',
  MCE: 'Bolsa de Madrid',
  STO: 'Nasdaq Stockholm',
  CPH: 'Nasdaq Copenhagen',
  HEL: 'Nasdaq Helsinki',
  OSL: 'Oslo Børs',
  VIE: 'Wiener Börse',
  LSE: 'London Stock Exchange',
};

/**
 * The venue's name, or the code itself when it is one we have not named.
 *
 * Falling back to the raw code is deliberate: a stock on an unlisted venue
 * still says where it trades, just less prettily, rather than dropping the fact.
 */
export function exchangeName(code: string | null | undefined): string | null {
  if (!code) return null;
  const key = code.toUpperCase();
  return EXCHANGE_NAMES[key] ?? code;
}
