/**
 * The one EDGAR client: a throttled fetch, the shared ticker→CIK map, and the
 * CIK padding — used by the fundamentals, filings and insider readers alike.
 *
 * Those three used to carry a copy each of secFetch, the ~1MB ticker file, the
 * rate-limit constant and the ten-digit padding. Each cached its own map, so a
 * process that touched all three fetched and held it three times; and a fix to
 * one — the User-Agent compliance among them — had to be remembered in the
 * other two, which is exactly how that bug hid. There is one copy now, and the
 * User-Agent still comes from secUserAgent.ts, its single source.
 *
 * getCik throws only when the ticker file itself will not load, which is what
 * the insider and fundamentals readers already did (the filings reader turns any
 * throw into an empty list in its own catch). A missing contact address, a
 * non-US suffix, or a ticker EDGAR does not list return null, not an error.
 */
import { secConfigured, secHeaders } from '../secUserAgent';

export const SEC_SUBMISSIONS = 'https://data.sec.gov/submissions/CIK';
export const SEC_ARCHIVES = 'https://www.sec.gov/Archives/edgar/data';
export const SEC_COMPANY_FACTS = 'https://data.sec.gov/api/xbrl/companyfacts/CIK';
const TICKER_FILE = 'https://www.sec.gov/files/company_tickers.json';

/** The SEC asks for no more than ten requests a second; this stays well under. */
export const MIN_REQUEST_INTERVAL_MS = 120;

let lastRequest = 0;

export interface SecFetchOptions {
  /** Abort after this many milliseconds. Defaults to 15s. */
  timeoutMs?: number;
  /** Next.js fetch-cache window, in seconds. Omitted means no revalidate hint. */
  revalidateSeconds?: number;
}

/**
 * One throttled fetch for every EDGAR call, carrying the required User-Agent.
 *
 * The throttle is process-wide now rather than one per module, so the filings,
 * insider and fundamentals readers share the ten-per-second budget instead of
 * each keeping their own.
 */
export async function secFetch(url: string, options: SecFetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, revalidateSeconds } = options;
  const wait = lastRequest + MIN_REQUEST_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();

  return fetch(url, {
    headers: secHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
    ...(revalidateSeconds != null ? { next: { revalidate: revalidateSeconds } } : {}),
  });
}

/** EDGAR keys its per-company paths on the CIK zero-padded to ten digits. */
export function paddedCik(cik: number): string {
  return String(cik).padStart(10, '0');
}

let tickerMap: Map<string, number> | null = null;

async function loadTickerMap(): Promise<Map<string, number>> {
  if (tickerMap) return tickerMap;
  const response = await secFetch(TICKER_FILE, { timeoutMs: 12_000, revalidateSeconds: 3_600 });
  if (!response.ok) throw new Error(`SEC ticker file: HTTP ${response.status}`);
  const raw = (await response.json()) as Record<string, { cik_str: number; ticker: string }>;
  tickerMap = new Map(
    Object.values(raw)
      .filter((e) => e?.ticker)
      .map((e) => [e.ticker.toUpperCase(), e.cik_str]),
  );
  return tickerMap;
}

/**
 * Ticker → CIK, from a map fetched and cached once for the process.
 *
 * Null for a non-US suffix, an unconfigured User-Agent, or a ticker EDGAR does
 * not list; throws only when the ticker file itself will not load.
 */
export async function getCik(symbol: string): Promise<number | null> {
  // A suffixed symbol is a non-US listing; EDGAR indexes US filers only, and
  // the bare ticker almost always belongs to a different company.
  if (symbol.includes('.')) return null;
  // Without a contact address EDGAR refuses the ticker file (403), so there is
  // nothing to be gained by asking.
  if (!secConfigured()) return null;
  const map = await loadTickerMap();
  return map.get(symbol.toUpperCase()) ?? null;
}
