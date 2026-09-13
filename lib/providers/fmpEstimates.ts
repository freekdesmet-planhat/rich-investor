/**
 * Financial Modeling Prep — analyst estimates only.
 *
 * finance-query exposes no forward-looking figures at all, and EDGAR is
 * historical filings by definition, so this is the only source for the
 * estimate-based parts of the spec: the forward PEG variant (5.2), forward EPS
 * growth (5.8) and the analyst block on the detail page.
 *
 * Deliberately narrow. FMP's free tier also serves fundamentals, but capped at
 * 5 periods and US-only, which is strictly worse than what EDGAR already gives
 * (16-19 years, plus the filing currency), so statements are not taken from here.
 *
 * Free-tier limits, measured rather than assumed:
 *   * Coverage is a subset of US listings. Of the 27 seed tickers, 15 return
 *     estimates; ASML, AVGO, AMAT, MA, AXP, BKNG are refused as premium, as are
 *     all six EU-only listings.
 *   * ~250 requests/day, so estimates are fetched for watchlist tickers only,
 *     never during the universe-wide auto-scan.
 *
 * A refused or missing symbol resolves to null, never an error: every caller
 * must already handle "no estimates", because most of the world's tickers have
 * none here.
 */
import type { AnalystEstimates, EstimatePoint } from './types';

const BASE_URL = 'https://financialmodelingprep.com/stable';
const REQUEST_TIMEOUT_MS = 20_000;

interface RawEstimate {
  symbol: string;
  date: string;
  epsAvg?: number | null;
  revenueAvg?: number | null;
  numAnalystsEps?: number | null;
  numAnalystsRevenue?: number | null;
}

interface RawPriceTarget {
  lastQuarterAvgPriceTarget?: number | null;
  lastMonthAvgPriceTarget?: number | null;
  lastYearAvgPriceTarget?: number | null;
}

/** FMP answers a refused symbol with 200 and an error object, not a 4xx. */
function isRefusal(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    ('Error Message' in payload || 'Premium Query Parameter' in payload)
  );
}

async function getJson<T>(path: string, apiKey: string): Promise<T | null> {
  const separator = path.includes('?') ? '&' : '?';
  try {
    const response = await fetch(`${BASE_URL}${path}${separator}apikey=${apiKey}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;

    const text = await response.text();
    // A plain-text "Premium Query Parameter: ..." body is also a refusal.
    if (text.startsWith('Premium') || text.startsWith('Legacy')) return null;

    const payload = JSON.parse(text) as unknown;
    return isRefusal(payload) ? null : (payload as T);
  } catch {
    return null;
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class FmpEstimatesProvider {
  readonly name = 'financial-modeling-prep';

  constructor(private readonly apiKey: string | undefined = process.env.FMP_API_KEY) {}

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async getAnalystEstimates(symbol: string): Promise<AnalystEstimates | null> {
    if (!this.apiKey) return null;

    const raw = await getJson<RawEstimate[]>(
      `/analyst-estimates?symbol=${encodeURIComponent(symbol)}&period=annual&limit=5`,
      this.apiKey,
    );
    if (!Array.isArray(raw) || raw.length === 0) return null;

    // FMP returns the furthest year first; the book cares about the next one.
    const series: EstimatePoint[] = raw
      .filter((r) => r?.date)
      .map((r) => ({
        fiscalYearEnd: r.date,
        eps: isNum(r.epsAvg) ? r.epsAvg : null,
        revenue: isNum(r.revenueAvg) ? r.revenueAvg : null,
        analystCount: isNum(r.numAnalystsEps) ? r.numAnalystsEps : null,
      }))
      .sort((a, b) => a.fiscalYearEnd.localeCompare(b.fiscalYearEnd));

    if (series.length === 0) return null;

    const [next, following] = series;

    const growth = (from: number | null | undefined, to: number | null | undefined) =>
      isNum(from) && isNum(to) && from > 0 ? to / from - 1 : null;

    const targets = await getJson<RawPriceTarget[]>(
      `/price-target-summary?symbol=${encodeURIComponent(symbol)}`,
      this.apiKey,
    );
    const target = targets?.[0];

    return {
      symbol,
      nextYearEps: next.eps,
      nextYearEpsGrowth: following ? growth(next.eps, following.eps) : null,
      nextYearRevenueGrowth: following ? growth(next.revenue, following.revenue) : null,
      analystCount: next.analystCount,
      targetPrice:
        target?.lastQuarterAvgPriceTarget ??
        target?.lastMonthAvgPriceTarget ??
        target?.lastYearAvgPriceTarget ??
        null,
      series,
    };
  }
}

export const fmpEstimatesProvider = new FmpEstimatesProvider();
