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

import { getCik, paddedCik, secFetch, SEC_ARCHIVES, SEC_SUBMISSIONS } from './sec/edgarClient';

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

/**
 * Recent filings, newest first.
 *
 * Returns an empty list rather than throwing for a company EDGAR does not
 * index — every non-US listing on the watchlist, which is a third of it — and
 * for an unconfigured User-Agent, which getCik reports as null. The tab renders
 * an explanation instead of an error; a ticker-file failure throws inside
 * getCik and the catch below turns it into the same empty list.
 */
export async function fetchRecentFilings(symbol: string, limit = 25): Promise<Filing[]> {
  if (symbol.includes('.')) return [];

  try {
    const cik = await getCik(symbol);
    if (cik === null) return [];

    const response = await secFetch(`${SEC_SUBMISSIONS}${paddedCik(cik)}.json`, {
      timeoutMs: 12_000,
      revalidateSeconds: 3_600,
    });
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
        url: `${SEC_ARCHIVES}/${cik}/${bare}/${recent.primaryDocument[i]}`,
      });
    }
    return filings;
  } catch {
    return [];
  }
}
