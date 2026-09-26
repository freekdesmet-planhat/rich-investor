/**
 * Turning the scan's candidate rules into a query the database can run.
 *
 * The scan used to ask for a page of large-cap US/Europe rows and then throw
 * most of the page away in JavaScript: cross-listings, then anything outside a
 * focus sector, then duplicate listings of the same company. Measured against
 * the live universe, 3,422 rows survived the SQL and 265 survived the
 * JavaScript — 92% of every page fetched, ordered and paged through was
 * discarded after it arrived.
 *
 * That is not merely wasteful. The cursor counts *rows consumed*, so the 92%
 * set the pace: a night's batch of sixty candidates walked past roughly eight
 * hundred rows to find them, and after several nights the scan had reached the
 * letter "AC" — five consecutive Credit Agricole certificate lines on Paris,
 * behind a wall of Frankfurt cross-listings of US companies.
 *
 * So both filters move into the query:
 *
 *   * the primary-listing test, which is a venue/country pair and expresses
 *     exactly as a SQL disjunction of pairs;
 *
 *   * the focus-sector test, which cannot be expressed exactly — it is
 *     most-specific-rule-wins over three levels — but whose *superset* can. A
 *     row can only resolve into a focus sector by matching some inclusive rule,
 *     so filtering to rows that match at least one is lossless, and the exact
 *     resolution still runs in JavaScript over a page that is now nearly all
 *     candidates.
 *
 * The builders are pure and return PostgREST filter strings, because the thing
 * most likely to be wrong here is the quoting, and quoting is worth a test.
 */
import type { FocusSector, SectorRule } from '@/lib/sectors/mapping';

/**
 * Primary listing venues, mapped to the country whose companies they host.
 *
 * FinanceDatabase carries every venue a company trades on, so a large-cap
 * filter over US and Europe is dominated by cross-listings rather than
 * companies: of the first batch scanned, 096.F was a US company on Frankfurt,
 * 0A46.L a US company on the LSE, and 0G8C.IL a Norwegian company on the
 * International Order Book. Analysing those is duplicated work against a
 * thinner order book than the primary line.
 *
 * A listing counts as primary when its venue's country matches the company's,
 * which filters cross-listings without needing an issuer identifier the dataset
 * does not carry.
 */
export const PRIMARY_EXCHANGES: Record<string, string> = {
  NMS: 'United States',
  NYQ: 'United States',
  NGM: 'United States',
  ASE: 'United States',
  PCX: 'United States',
  AMS: 'Netherlands',
  PAR: 'France',
  EBS: 'Switzerland',
  GER: 'Germany',
  FRA: 'Germany',
  MIL: 'Italy',
  MCE: 'Spain',
  STO: 'Sweden',
  CPH: 'Denmark',
  HEL: 'Finland',
  OSL: 'Norway',
  BRU: 'Belgium',
  LIS: 'Portugal',
  VIE: 'Austria',
  LSE: 'United Kingdom',
  ISE: 'Ireland',
};

export function isPrimaryListing(exchange: string | null, country: string | null): boolean {
  if (!exchange || !country) return false;
  return PRIMARY_EXCHANGES[exchange.toUpperCase()] === country;
}

/** Venue codes worth querying at all, so the page is not spent on noise. */
export const PRIMARY_EXCHANGE_CODES = Object.keys(PRIMARY_EXCHANGES);

/**
 * A value inside a PostgREST filter.
 *
 * Everything is quoted rather than only the values that need it. Sector and
 * industry labels carry spaces, commas and ampersands — "Textiles, Apparel &
 * Luxury Goods" would otherwise be read as two filter terms — and deciding
 * per value which ones need quoting is exactly the kind of judgement that is
 * right until the dataset adds a label nobody predicted.
 */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The primary-listing test as a PostgREST `or` filter.
 *
 * `exchange in (...)` alone was the old prefilter, and it is what let Frankfurt
 * cross-listings of US companies through: FRA is a legitimate primary venue for
 * German companies, so the code cannot be excluded — only the *pairing* with a
 * country that is not Germany can be.
 */
export function primaryListingFilter(
  exchanges: Record<string, string> = PRIMARY_EXCHANGES,
): string {
  return Object.entries(exchanges)
    .map(
      ([exchange, country]) =>
        `and(exchange.eq.${quoteFilterValue(exchange)},country.eq.${quoteFilterValue(country)})`,
    )
    .join(',');
}

/** The main US exchanges. A foreign-domiciled company's US listing lives here. */
export const US_PRIMARY_VENUES = ['NMS', 'NYQ', 'NGM', 'ASE', 'PCX'];

/**
 * Which listings the scan admits: a home-country primary (as before), OR any
 * listing on a main US exchange. The second arm brings in a company domiciled
 * abroad but listed only in the US (Accenture, Spotify, Arm, NXP), whose venue
 * never matches its home country. It deliberately does NOT admit foreign venues
 * for a US-domiciled company — a US name's thin London/Frankfurt/Vienna line has a
 * real home listing to collapse onto, and admitting it leaked those cross-listings
 * (and re-surfaced names their symbol rule had excluded). The home listing still
 * wins a dual listing, because the collapse sorts home-country first (2026-09-26).
 */
export function scanVenueFilter(): string {
  return `exchange.in.(${US_PRIMARY_VENUES.join(',')}),${primaryListingFilter()}`;
}

export interface FocusPrefilter {
  symbols: string[];
  sectors: string[];
  industries: string[];
}

/**
 * The sector, industry and symbol values that could possibly resolve in focus.
 *
 * Deliberately a superset, and the reason is the resolution order:
 * most-specific-rule-wins means a row matching an inclusive industry rule can
 * still land outside the focus if a symbol rule overrides it. Reproducing that
 * precedence in SQL would mean reproducing `resolveFocusSector` in SQL, in a
 * second place, against a table the settings screen edits.
 *
 * What is safe is the other direction: a row that matches *no* inclusive rule
 * can never resolve into a focus sector, so excluding it in the query changes
 * no outcome. The JavaScript still decides.
 */
export function focusPrefilter(rules: SectorRule[]): FocusPrefilter {
  const symbols = new Set<string>();
  const sectors = new Set<string>();
  const industries = new Set<string>();

  for (const rule of rules) {
    if (rule.focusSector === ('outside_focus' satisfies FocusSector)) continue;
    if (rule.isExcluded) continue;

    if (rule.symbol) {
      symbols.add(rule.symbol);
      continue;
    }
    // A sector-only rule carries its whole sector, whatever the industry says,
    // so the sector is the term to filter on. A sector+industry rule is
    // narrower, and the industry alone is a safe superset of it.
    if (rule.industry) industries.add(rule.industry);
    else if (rule.sector) sectors.add(rule.sector);
  }

  return {
    symbols: [...symbols].sort(),
    sectors: [...sectors].sort(),
    industries: [...industries].sort(),
  };
}

/**
 * The focus prefilter as a PostgREST `or`, or null when it would match nothing.
 *
 * Null rather than an empty filter: a rule set with nothing inclusive in it is
 * a misconfiguration, and a query that silently returns no candidates is how
 * the scan went quiet in the first place. The caller scans unfiltered and says
 * so instead.
 */
export function focusSectorFilter(rules: SectorRule[]): string | null {
  const { symbols, sectors, industries } = focusPrefilter(rules);
  const terms: string[] = [];

  const inList = (values: string[]) => `(${values.map(quoteFilterValue).join(',')})`;
  if (symbols.length > 0) terms.push(`symbol.in.${inList(symbols)}`);
  if (sectors.length > 0) terms.push(`sector.in.${inList(sectors)}`);
  if (industries.length > 0) terms.push(`industry.in.${inList(industries)}`);

  return terms.length > 0 ? terms.join(',') : null;
}
