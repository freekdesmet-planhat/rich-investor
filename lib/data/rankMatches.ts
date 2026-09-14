/**
 * How search results are ordered.
 *
 * Kept out of `queries.ts` because it is pure — no database, no session — and
 * because that module carries the `server-only` guard, which a unit test cannot
 * load. The ordering is the part of search most likely to be wrong in a way no
 * type checks, so it is the part most worth testing directly.
 */
import { isPrimaryListing } from '@/lib/pipeline/scan';

/**
 * Names of instruments written on a company rather than the company itself.
 *
 * Searching "shopify" matched four leveraged ETPs before Shopify Inc., because
 * each ETP is domiciled where it trades while the company is not. These are
 * ranked below real listings rather than hidden, since someone who searches for
 * an ETP by name should still find it.
 */
const DERIVATIVE_NAME =
  /\b(etp|etn|etf)\b|leverage shares|\bls [-\d]|\b\d+x\b|\bshort\b|\bdrn\b|sub\.vtg/i;

export interface RankableListing {
  symbol: string;
  name: string | null;
  exchange: string | null;
  country: string | null;
}

/**
 * Orders matches so the company someone searched for comes first.
 *
 * Pure, and exported, because the ordering is the part of search most likely to
 * be wrong in a way no type checks: "shopify" put four leveraged ETPs above
 * Shopify Inc. until the name-prefix test was added.
 */
export function rankUniverseMatches<T extends RankableListing>(rows: T[], query: string): T[] {
  const lower = query.trim().toLowerCase();
  const name = (r: T) => (r.name ?? '').toLowerCase();

  return [...rows].sort((a, b) => {
    // An exact symbol match is what someone typing a ticker wants first.
    const exactSymbol = (r: T) => (r.symbol.toLowerCase() === lower ? 0 : 1);
    // "Shopify Inc." begins with what was typed; "Leverage Shares 3x Shopify
    // ETP" merely contains it. That one test is what separates a company from
    // the instruments written on top of it.
    const nameStarts = (r: T) => (name(r).startsWith(lower) ? 0 : 1);
    const notDerivative = (r: T) => (DERIVATIVE_NAME.test(r.name ?? '') ? 1 : 0);
    const symbolStarts = (r: T) => (r.symbol.toLowerCase().startsWith(lower) ? 0 : 1);
    // Kept as a weak signal only: it asks whether a company trades in its own
    // country, which is false for ASML on NASDAQ and Shopify in New York, and
    // true for a London ETP. Useful as a tie-break, wrong as a filter.
    const primary = (r: T) => (isPrimaryListing(r.exchange, r.country) ? 0 : 1);

    return (
      exactSymbol(a) - exactSymbol(b) ||
      nameStarts(a) - nameStarts(b) ||
      notDerivative(a) - notDerivative(b) ||
      symbolStarts(a) - symbolStarts(b) ||
      primary(a) - primary(b) ||
      name(a).length - name(b).length ||
      (a.name ?? a.symbol).localeCompare(b.name ?? b.symbol)
    );
  });
}
