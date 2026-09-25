/**
 * The rules that decide what search shows: the size floor, the instruments to
 * drop, and how a typed query is folded to match a company name.
 *
 * Pure and separate from queries.ts (which carries the `server-only` guard a
 * unit test cannot load) because these are the parts most worth testing
 * directly — a floor that hides Coca-Cola or a filter that drops "Unity
 * Software" is the kind of bug no type check catches.
 */

/**
 * V1 is large companies only. FinanceDatabase's Large Cap band is $10B–$200B and
 * Mega Cap is above it, so these two are the "≥ $10bn" floor. The labels can be
 * stale (a name that has since shrunk keeps its old band), which is why the
 * checklist's real-USD market-cap condition, not this, is the authority — see
 * NEXT-STEPS 2026-09-25. A name with a null band is not shown by the floor; the
 * exact-ticker rescue below is what surfaces a recent IPO the static dataset has
 * not classified yet.
 */
import { isPrimaryListing } from '@/lib/pipeline/scanQuery';

export const SEARCHABLE_BANDS = ['Large Cap', 'Mega Cap'] as const;

/** The label shown per result. Never a ✓ — the ✓ belongs to the checklist. */
export type SizeLabel = 'large' | 'mega' | 'checkedOnAnalysis' | null;

export function sizeLabelOf(band: string | null): SizeLabel {
  if (band === 'Large Cap') return 'large';
  if (band === 'Mega Cap') return 'mega';
  // A rescued null-band exact match: the size will be checked on analysis, from
  // the real USD figure, rather than asserted from a band we do not have.
  if (band == null) return 'checkedOnAnalysis';
  return null;
}

/** Diacritic-fold and lowercase, matching the SQL `search_text` column. */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export interface NormalisedQuery {
  /** Folded, punctuation-collapsed query, e.g. "coca-cola" -> "coca cola". */
  folded: string;
  /** PostgREST ILIKE pattern for search_text, e.g. "*coca*cola*" — spans spaces and hyphens. */
  pattern: string;
  /** Uppercased symbol candidate for an exact/prefix match, e.g. "ASML.AS". */
  symbol: string;
}

export function normaliseQuery(raw: string): NormalisedQuery | null {
  const folded = foldText(raw).replace(/[^a-z0-9]+/g, ' ').trim();
  if (folded.length < 2) return null;
  const pattern = `*${folded.split(/\s+/).join('*')}*`;
  const symbol = raw.trim().toUpperCase().replace(/\s+/g, '');
  return { folded, pattern, symbol };
}

// --- instruments that are not the company itself --------------------------

/**
 * Named instruments written on a company, in the languages the universe carries.
 * Word boundaries only, so "Unity Software" (not a unit) and "Preferred Bank"
 * (not a preferred share) survive. ADRs are deliberately not here — an American
 * Depositary listing is how a US audience holds a foreign company.
 */
const NAME_EXCLUDE =
  /\b(warrants?|rights?|units?|subscription receipts?|optionsschein|turbos?|mini[-\s]?futures?|knock[-\s]?outs?|certificates?|etp|etn|etf)\b|leverage shares|\b\d+x\b/i;

/**
 * Preferred shares, matched narrowly. "Preferred" alone is a company word
 * ("Preferred Bank"); a preferred *security* names the security.
 */
const PREFERRED_NAME =
  /\bpreferred (stock|shares?|securit|series|depositary)\b|\bpfd\b|\b(cumulative|redeemable) preferred\b/i;

/**
 * Symbol suffixes for warrants (-WT), when-issued (-WI), rights (-RI/-RW/-RT),
 * units (-UN) and preferred series (-PA..-PZ). These rows frequently have a null
 * name, so the symbol is the only signal.
 */
const SYMBOL_EXCLUDE = /(-WT|-WTS|-WI|-RI|-RT|-RW|-UN|-P[A-Z]?)$/i;

/** Exchange test tickers (ZJZZT, ATEST, NTEST-C…) that are not securities at all. */
const TEST_TICKER = /^[A-Z]?TEST(-|$)|^Z[A-Z]ZZT$/;

/** True for a row that is an instrument or test ticker rather than a company. */
export function isExcludedInstrument(name: string | null, symbol: string): boolean {
  const n = name ?? '';
  if (NAME_EXCLUDE.test(n) || PREFERRED_NAME.test(n)) return true;
  if (SYMBOL_EXCLUDE.test(symbol) || TEST_TICKER.test(symbol)) return true;
  return false;
}

/**
 * Whether a row clears the size floor. Large and Mega always pass; a null band
 * passes only when the typed query is its exact ticker (the recent-IPO rescue).
 * Mid/Small/Micro/Nano never pass, even on an exact match — they are known to be
 * too small.
 */
export function passesSizeFloor(band: string | null, isExactSymbol: boolean): boolean {
  if ((SEARCHABLE_BANDS as readonly string[]).includes(band ?? '')) return true;
  if (band == null && isExactSymbol) return true;
  return false;
}

// --- one row per company, home listing first ------------------------------

/** Readable venue names for the "Also listed on …" line. */
const VENUE_LABEL: Record<string, string> = {
  NMS: 'Nasdaq', NGM: 'Nasdaq', NYQ: 'NYSE', ASE: 'NYSE American', PCX: 'NYSE Arca',
  AMS: 'Amsterdam', PAR: 'Paris', GER: 'XETRA', FRA: 'Frankfurt', EBS: 'Zurich',
  MIL: 'Milan', MCE: 'Madrid', STO: 'Stockholm', CPH: 'Copenhagen', HEL: 'Helsinki',
  OSL: 'Oslo', BRU: 'Brussels', LIS: 'Lisbon', VIE: 'Vienna', LSE: 'London', ISE: 'Dublin',
  MEX: 'Mexico', SAO: 'São Paulo', TOR: 'Toronto', LSN: 'London',
};

/** Among equally-home venues, the main board over its secondary duplicates. */
const VENUE_PRIORITY: Record<string, number> = {
  NMS: 0, NYQ: 0, NGM: 1, ASE: 2, PCX: 3,
  AMS: 0, PAR: 0, EBS: 0, GER: 0, MIL: 0, MCE: 0, STO: 0,
  CPH: 0, HEL: 0, OSL: 0, BRU: 0, LIS: 0, VIE: 0, LSE: 0, ISE: 0,
  FRA: 5,
};

interface Listing {
  symbol: string;
  name: string | null;
  exchange: string | null;
  country: string | null;
}

/**
 * Collapses a company's many venue listings into one row.
 *
 * "apple" returned nineteen Apple Inc rows and "asml" put the Nasdaq line above
 * Amsterdam. Grouping is by folded name and country, and the representative is
 * the home-country listing (the exchange in the company's own country), so a
 * Dutch company shows its Amsterdam line, not its US one — the listing a
 * European reader actually holds. The rest become "Also listed on …".
 */
export function collapseCompanies<T extends Listing>(rows: T[]): (T & { alsoListedOn: string[] })[] {
  const venue = (e: string | null) => (e ?? '').toUpperCase();
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = `${foldText(r.name ?? r.symbol).trim()}|${(r.country ?? '').toLowerCase()}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const out: (T & { alsoListedOn: string[] })[] = [];
  for (const listings of groups.values()) {
    const sorted = [...listings].sort((a, b) => {
      const homeA = isPrimaryListing(a.exchange, a.country) ? 0 : 1;
      const homeB = isPrimaryListing(b.exchange, b.country) ? 0 : 1;
      if (homeA !== homeB) return homeA - homeB;
      const prioA = VENUE_PRIORITY[venue(a.exchange)] ?? 9;
      const prioB = VENUE_PRIORITY[venue(b.exchange)] ?? 9;
      if (prioA !== prioB) return prioA - prioB;
      return a.symbol.length - b.symbol.length;
    });
    const [rep, ...others] = sorted;
    const alsoListedOn = [
      ...new Set(
        others.map((l) => VENUE_LABEL[venue(l.exchange)] ?? l.exchange).filter((v): v is string => Boolean(v)),
      ),
    ];
    out.push({ ...rep, alsoListedOn });
  }
  return out;
}
