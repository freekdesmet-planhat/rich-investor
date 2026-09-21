/**
 * Earnings call transcripts, from Equibles Cloud.
 *
 * FMP's transcript endpoint is paywalled on this tier and EarningsCall has no
 * free tier at all, so this is the one free source found: 100 requests a day,
 * no card. That allowance is the design constraint. It comfortably covers a
 * person opening a research tab a few times a day and would not survive being
 * called from the nightly scan, so it never is.
 *
 * ── Treated as a soft dependency, deliberately ────────────────────────
 *
 * It is a solo-maintainer project rather than an established data vendor, and
 * the app is built so that its absence is a quiet gap rather than a failure:
 *
 *   no API key configured  → the tab says transcripts are not set up
 *   rate limited, down, slow, or the company simply is not covered
 *                          → the tab says there is nothing to show
 *
 * Every path returns data or null. Nothing here throws, because a third-party
 * transcript service having a bad afternoon must not be able to take the
 * research tab — let alone the stock page — down with it.
 */

const BASE = 'https://api.equibles.com/v1';
const TIMEOUT_MS = 8_000;

export interface EarningsCall {
  id: string;
  title: string | null;
  callDate: string | null;
  fiscalYear: number | null;
  fiscalQuarter: number | null;
  hasTranscript: boolean;
  webcastUrl: string | null;
}

export interface TranscriptTurn {
  speakerName: string | null;
  speakerRole: string | null;
  text: string;
}

export interface Transcript {
  title: string | null;
  callDate: string | null;
  turns: TranscriptTurn[];
  /** More turns exist than were fetched. */
  hasMore: boolean;
}

export const transcriptsConfigured = (): boolean => Boolean(process.env.EQUIBLES_API_KEY);

async function get<T>(path: string): Promise<T | null> {
  const key = process.env.EQUIBLES_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Transcripts do not change once published, and the daily allowance is
      // 100 requests. Caching for an hour turns a reader flipping between
      // tabs into one request rather than a dozen.
      next: { revalidate: 3_600 },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Recent calls for a ticker, newest first. Null when unavailable.
 *
 * The list lives under investor-events, not under earnings-calls: that path
 * exists only with a fiscal year and quarter already in hand, which is the
 * thing this call is for finding out. `eventType` narrows the feed to
 * earnings calls, since it also carries conferences, investor days and AGMs.
 */
export async function fetchEarningsCalls(symbol: string, limit = 12): Promise<EarningsCall[] | null> {
  // Non-US listings are not covered, and asking spends an allowance that is
  // only 100 a day.
  if (symbol.includes('.')) return [];

  const raw = await get<{ data?: unknown[] } | unknown[]>(
    `/stocks/${encodeURIComponent(symbol)}/investor-events?eventType=EarningsCall&limit=${limit}`,
  );
  if (raw === null) return null;

  const list = Array.isArray(raw) ? raw : (raw.data ?? []);
  return (list as Array<Record<string, unknown>>)
    .map((call) => ({
      id: String(call.id ?? ''),
      title: (call.title as string) ?? null,
      callDate: (call.callDate as string) ?? null,
      fiscalYear: (call.fiscalYear as number) ?? null,
      fiscalQuarter: (call.fiscalQuarter as number) ?? null,
      hasTranscript: call.hasTranscript === true,
      webcastUrl: (call.webcastUrl as string) ?? null,
    }))
    .filter((call) => call.fiscalYear != null && call.fiscalQuarter != null)
    .sort((a, b) => (b.callDate ?? '').localeCompare(a.callDate ?? ''));
}

/**
 * One call's transcript, as speaker turns.
 *
 * `limit` is the provider's page size, capped at 200 by them. The research
 * tab asks for one page: a full call runs to several hundred turns, and
 * paging through all of them would spend several of the day's hundred
 * requests to render something nobody reads to the end in one sitting.
 */
export async function fetchTranscript(
  symbol: string,
  fiscalYear: number,
  fiscalQuarter: number,
  limit = 200,
): Promise<Transcript | null> {
  const raw = await get<Record<string, unknown>>(
    `/stocks/${encodeURIComponent(symbol)}/earnings-calls/${fiscalYear}/${fiscalQuarter}/speakers?limit=${limit}`,
  );
  if (raw === null) return null;

  const turns = ((raw.data as Array<Record<string, unknown>>) ?? [])
    .map((turn) => ({
      speakerName: (turn.speakerName as string) ?? null,
      speakerRole: (turn.speakerRole as string) ?? null,
      text: String(turn.text ?? '').trim(),
    }))
    .filter((turn) => turn.text !== '');

  return {
    title: (raw.eventTitle as string) ?? null,
    callDate: (raw.callDate as string) ?? null,
    turns,
    hasMore: raw.hasMore === true,
  };
}
