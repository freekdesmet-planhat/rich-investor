/**
 * Market-wide context (section 5.20).
 *
 * Four figures, from two sources, each of which degrades on its own: a missing
 * metric leaves that card blank and says why, rather than failing the whole
 * dashboard or — worse — showing a number nobody can trace.
 *
 * Source notes, established by probing rather than from documentation:
 *
 *   FRED's CSV endpoint needs no API key, so the Treasury spread and GDP work
 *   without one. FRED_API_KEY is therefore optional here; it is kept as an
 *   option because the keyed JSON API is rate-limited more generously.
 *
 *   FRED's Wilshire 5000 series (WILL5000PRFC and its variants) now 404 on that
 *   endpoint, so total market capitalisation comes from Yahoo's ^W5000 index,
 *   whose points are denominated in billions of dollars — the same units as
 *   FRED's GDP series, which is what makes the ratio work. NCBEILQ027S (the Fed
 *   Z.1 corporate equities level) is the fallback.
 *
 *   ^GSPC carries no trailing P/E on Yahoo, so the S&P 500 multiple comes from
 *   SPY, which tracks the same index and does report one.
 */
import YahooFinance from 'yahoo-finance2';

const FRED_CSV = 'https://fred.stlouisfed.org/graph/fredgraph.csv';
const REQUEST_TIMEOUT_MS = 20_000;

const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
  validation: { logErrors: false, logOptionsErrors: false },
});

export interface MacroSnapshot {
  date: string;
  buffettIndicator: number | null;
  yieldSpread10y2y: number | null;
  spyRspSpread: number | null;
  sp500Pe: number | null;
  /** Which source supplied each figure. */
  sources: Record<string, string>;
  /** What could not be fetched, and why. */
  errors: string[];
}

/** Latest non-empty observation from a FRED series, via the keyless CSV. */
export async function fetchFredSeries(
  seriesId: string,
): Promise<{ date: string; value: number } | null> {
  try {
    const response = await fetch(`${FRED_CSV}?id=${encodeURIComponent(seriesId)}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const text = await response.text();
    // An error page is HTML, not CSV; the header row is the cheapest tell.
    if (!text.startsWith('observation_date')) return null;

    const rows = text.trim().split('\n').slice(1);
    for (let i = rows.length - 1; i >= 0; i--) {
      const [date, raw] = rows[i].split(',');
      const value = Number(raw);
      // FRED writes "." for a missing observation.
      if (date && raw && raw !== '.' && Number.isFinite(value)) return { date, value };
    }
    return null;
  } catch {
    return null;
  }
}

/** One-year total return from daily closes, as a fraction. */
export async function fetchOneYearReturn(symbol: string): Promise<number | null> {
  try {
    const from = new Date(Date.now() - 400 * 86_400_000);
    const chart = await yf.chart(symbol, { period1: from, interval: '1d' });
    const quotes = (chart.quotes ?? []).filter((q) => q.close != null);
    if (quotes.length < 2) return null;

    const last = quotes[quotes.length - 1];
    const target = Date.now() - 365 * 86_400_000;

    // Markets are closed on plenty of days, so take the bar nearest a year ago
    // rather than assuming one exists on the date itself.
    let base = quotes[0];
    for (const quote of quotes) {
      if (
        Math.abs(new Date(quote.date).getTime() - target) <
        Math.abs(new Date(base.date).getTime() - target)
      ) {
        base = quote;
      }
    }

    if (!base.close || !last.close || base.close <= 0) return null;
    return last.close / base.close - 1;
  } catch {
    return null;
  }
}

interface QuoteNumbers {
  price?: { regularMarketPrice?: number | null };
  summaryDetail?: { trailingPE?: number | null };
  defaultKeyStatistics?: { trailingPE?: number | null };
}

async function fetchQuoteNumber(
  symbol: string,
  pick: (summary: QuoteNumbers) => number | null | undefined,
): Promise<number | null> {
  try {
    const summary = (await yf.quoteSummary(symbol, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics'],
    })) as QuoteNumbers;
    const value = pick(summary);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export async function fetchMacroSnapshot(
  date = new Date().toISOString().slice(0, 10),
): Promise<MacroSnapshot> {
  const sources: Record<string, string> = {};
  const errors: string[] = [];

  const [gdp, treasurySpread, wilshire, corporateEquities, spy1y, rsp1y, spyPe] =
    await Promise.all([
      fetchFredSeries('GDP'),
      fetchFredSeries('T10Y2Y'),
      fetchQuoteNumber('^W5000', (s) => s.price?.regularMarketPrice),
      fetchFredSeries('NCBEILQ027S'),
      fetchOneYearReturn('SPY'),
      fetchOneYearReturn('RSP'),
      fetchQuoteNumber(
        'SPY',
        (s) => s.summaryDetail?.trailingPE ?? s.defaultKeyStatistics?.trailingPE,
      ),
    ]);

  // --- Buffett indicator ---------------------------------------------------
  let buffettIndicator: number | null = null;
  if (gdp && wilshire != null) {
    // ^W5000 points are billions of dollars; FRED's GDP is billions of dollars.
    buffettIndicator = (wilshire / gdp.value) * 100;
    sources.buffett = `yahoo:^W5000 / fred:GDP (${gdp.date})`;
  } else if (gdp && corporateEquities) {
    // Z.1 reports millions; GDP reports billions.
    buffettIndicator = (corporateEquities.value / 1000 / gdp.value) * 100;
    sources.buffett = `fred:NCBEILQ027S / fred:GDP (${gdp.date})`;
    errors.push('Wilshire 5000 unavailable; used the Fed Z.1 corporate equities level instead');
  } else {
    errors.push('Buffett indicator unavailable: no market-capitalisation or GDP series');
  }

  // --- yield curve ---------------------------------------------------------
  const yieldSpread10y2y = treasurySpread?.value ?? null;
  if (treasurySpread) sources.yieldSpread = `fred:T10Y2Y (${treasurySpread.date})`;
  else errors.push('Treasury spread unavailable');

  // --- concentration -------------------------------------------------------
  let spyRspSpread: number | null = null;
  if (spy1y != null && rsp1y != null) {
    // Percentage points, so the card reads as a gap rather than a ratio.
    spyRspSpread = (spy1y - rsp1y) * 100;
    sources.concentration = 'yahoo:SPY − yahoo:RSP, 1-year return';
  } else {
    errors.push('Concentration spread unavailable: missing SPY or RSP history');
  }

  // --- S&P 500 multiple ----------------------------------------------------
  const sp500Pe = spyPe;
  if (spyPe != null) sources.sp500Pe = 'yahoo:SPY trailing P/E (^GSPC reports none)';
  else errors.push('S&P 500 P/E unavailable');

  return {
    date,
    buffettIndicator,
    yieldSpread10y2y,
    spyRspSpread,
    sp500Pe,
    sources,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Thresholds for the dashboard's colour coding
// ---------------------------------------------------------------------------

export type MacroTone = 'good' | 'warn' | 'bad' | 'neutral';

/** Above 150% the book's gauge reads as an expensive market. */
export function buffettTone(value: number | null): MacroTone {
  if (value == null) return 'neutral';
  if (value > 150) return 'warn';
  if (value <= 100) return 'good';
  return 'neutral';
}

/** An inverted curve is the signal; the book cares about direction, not level. */
export function yieldTone(value: number | null): MacroTone {
  if (value == null) return 'neutral';
  if (value < 0) return 'bad';
  return 'good';
}

/** A gap beyond 5 points means the index is being carried by its largest names. */
export function concentrationTone(value: number | null): MacroTone {
  if (value == null) return 'neutral';
  return value > 5 ? 'warn' : 'neutral';
}

/** Context only: the book gives no threshold for the index multiple itself. */
export function peTone(): MacroTone {
  return 'neutral';
}
