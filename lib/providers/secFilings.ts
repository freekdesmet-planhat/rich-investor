/**
 * Recent SEC filings for a company, as links.
 *
 * The same EDGAR submissions index the insider reader uses, read for a
 * different purpose: one request, no per-document fetch, so this is fast
 * enough to do while a page renders.
 *
 * Form 4s are excluded. A company files them most weeks and they would bury
 * the 10-K under forty routine insider reports — and the insider block on
 * the stock page already reads them properly. What belongs here is the
 * filings a person would actually open.
 */

import { secConfigured, secHeaders } from './secUserAgent';

const SUBMISSIONS = 'https://data.sec.gov/submissions/CIK';
const TICKER_FILE = 'https://www.sec.gov/files/company_tickers.json';
const ARCHIVES = 'https://www.sec.gov/Archives/edgar/data';

/** Worth opening. Everything else is noise at this level of detail. */
const INTERESTING_FORMS = new Set([
  '10-K', '10-K/A', '10-Q', '10-Q/A',
  '8-K', '8-K/A',
  '20-F', '20-F/A', '40-F',
  'DEF 14A', 'DEFA14A',
  '6-K', 'S-1', 'S-3', '424B2', '424B5',
]);

export interface Filing {
  form: string;
  filedOn: string;
  /** Period the filing covers, when EDGAR records one. */
  reportFor: string | null;
  url: string;
}

let tickerMap: Map<string, number> | null = null;

async function secFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: secHeaders(),
    signal: AbortSignal.timeout(12_000),
    next: { revalidate: 3_600 },
  });
}

/**
 * Recent filings, newest first.
 *
 * Returns an empty list rather than throwing for a company EDGAR does not
 * index — every non-US listing on the watchlist, which is a third of it.
 * The tab renders an explanation instead of an error.
 */
export async function fetchRecentFilings(symbol: string, limit = 25): Promise<Filing[]> {
  if (symbol.includes('.')) return [];
  // No contact address configured means EDGAR will refuse the ticker file,
  // so there is nothing to be gained by asking.
  if (!secConfigured()) return [];

  try {
    if (!tickerMap) {
      const response = await secFetch(TICKER_FILE);
      if (!response.ok) return [];
      const raw = (await response.json()) as Record<string, { cik_str: number; ticker: string }>;
      tickerMap = new Map(
        Object.values(raw)
          .filter((e) => e?.ticker)
          .map((e) => [e.ticker.toUpperCase(), e.cik_str]),
      );
    }

    const cik = tickerMap.get(symbol.toUpperCase());
    if (cik === undefined) return [];

    const response = await secFetch(`${SUBMISSIONS}${String(cik).padStart(10, '0')}.json`);
    if (!response.ok) return [];

    const recent = (
      (await response.json()) as {
        filings: {
          recent: {
            form: string[];
            filingDate: string[];
            reportDate: string[];
            accessionNumber: string[];
            primaryDocument: string[];
          };
        };
      }
    ).filings.recent;

    const filings: Filing[] = [];
    for (let i = 0; i < recent.form.length && filings.length < limit; i++) {
      if (!INTERESTING_FORMS.has(recent.form[i])) continue;
      const bare = recent.accessionNumber[i].replace(/-/g, '');
      filings.push({
        form: recent.form[i],
        filedOn: recent.filingDate[i],
        reportFor: recent.reportDate[i] || null,
        url: `${ARCHIVES}/${cik}/${bare}/${recent.primaryDocument[i]}`,
      });
    }
    return filings;
  } catch {
    return [];
  }
}
