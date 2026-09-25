/**
 * Insider transactions, from EDGAR.
 *
 * FMP's insider endpoint is paywalled on the tier this project uses, so the
 * data comes from the source instead: the Form 4s that companies and their
 * officers file with the SEC. Free, public, no key, and authoritative — it is
 * the filing every commercial insider feed is itself derived from.
 *
 * The cost is that it is two hops. EDGAR gives a filing index per company,
 * and each Form 4 is a separate XML document. A ninety-day window on an
 * actively traded company is ten to forty of them, and the SEC asks callers
 * to stay under ten requests a second. So this is slow by construction —
 * seconds, not milliseconds — which is why it is cached per symbol and
 * refreshed lazily rather than run inside the nightly job.
 *
 * Parsing lives in form4.ts.
 */
import { parseForm4, summariseInsiderActivity, type Form4Transaction, type InsiderSummary } from './form4';

import { getCik, paddedCik, secFetch, SEC_ARCHIVES, SEC_SUBMISSIONS } from './sec/edgarClient';
import { secConfigured } from './secUserAgent';

/** Abort a submissions or Form 4 request after this long. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The most Form 4s read in one refresh.
 *
 * A ceiling rather than a target. Companies with very active insiders can
 * file hundreds in a quarter, and reading all of them would turn a lazy
 * refresh into a minute-long request. Forty covers the ninety-day window for
 * almost every company on a large-cap watchlist, and the count that was
 * actually read is returned so a truncated answer can say so.
 */
const MAX_FILINGS = 40;

export const DEFAULT_WINDOW_DAYS = 90;

interface Submissions {
  filings: {
    recent: {
      form: string[];
      filingDate: string[];
      accessionNumber: string[];
      primaryDocument: string[];
    };
  };
}

export interface InsiderActivity {
  symbol: string;
  windowDays: number;
  summary: InsiderSummary;
  /** Newest first. */
  transactions: Form4Transaction[];
  filingsRead: number;
  /** True when MAX_FILINGS cut the window short. */
  truncated: boolean;
}

/**
 * Every Form 4 transaction this company reported inside the window.
 *
 * Throws only for a failure that makes the whole answer wrong — no CIK, or
 * EDGAR refusing the index. An individual filing that will not fetch or parse
 * is skipped, because one malformed document out of thirty should cost its
 * own row and nothing else.
 */
export async function fetchInsiderActivity(
  symbol: string,
  windowDays = DEFAULT_WINDOW_DAYS,
  now: Date = new Date(),
): Promise<InsiderActivity> {
  const empty = (): InsiderActivity => ({
    symbol,
    windowDays,
    summary: summariseInsiderActivity([]),
    transactions: [],
    filingsRead: 0,
    truncated: false,
  });

  // Unconfigured is an empty answer, not an error: the block renders its
  // "nothing to show" state rather than a failure the reader cannot act on.
  if (!secConfigured()) return empty();

  const cik = await getCik(symbol);
  if (cik === null) return empty();

  const response = await secFetch(`${SEC_SUBMISSIONS}${paddedCik(cik)}.json`, {
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  if (!response.ok) throw new Error(`SEC submissions for ${symbol}: HTTP ${response.status}`);

  const recent = ((await response.json()) as Submissions).filings.recent;
  const cutoff = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);

  const wanted = recent.form
    .map((form, i) => ({
      form,
      date: recent.filingDate[i],
      accession: recent.accessionNumber[i],
      document: recent.primaryDocument[i],
    }))
    .filter((f) => f.form === '4' && f.date >= cutoff);

  const truncated = wanted.length > MAX_FILINGS;
  const transactions: Form4Transaction[] = [];
  let filingsRead = 0;

  for (const filing of wanted.slice(0, MAX_FILINGS)) {
    const bare = filing.accession.replace(/-/g, '');
    try {
      // `primaryDocument` points at the XSL-rendered HTML view —
      // `xslF345X06/wk-form4_1789769889.xml` — and the raw XML sits beside it
      // under the same name without that prefix.
      //
      // Guessing `form4.xml` instead works for Apple and fails for Adobe,
      // whose filing agent names the document `wk-form4_<id>.xml`. That
      // failure is quiet in exactly the wrong way: every fetch 404s, the
      // catch skips it, and the company looks like one with no insider
      // activity rather than one the code could not read.
      const name = filing.document.replace(/^.*\//, '');
      const doc = await secFetch(`${SEC_ARCHIVES}/${cik}/${bare}/${name}`, {
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      if (!doc.ok) continue;
      transactions.push(...parseForm4(await doc.text()).transactions);
      filingsRead++;
    } catch {
      // One unreadable filing is not worth failing the other thirty-nine.
    }
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date));

  return {
    symbol,
    windowDays,
    summary: summariseInsiderActivity(transactions),
    transactions,
    filingsRead,
    truncated,
  };
}
