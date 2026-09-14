/**
 * How many universe candidates the nightly run may evaluate.
 *
 * The nightly job does two things, and they draw on different providers:
 *
 *   the watchlist pass fetches fundamentals *and* estimates, so it spends one
 *   FMP call per ticker — about thirty a night at present;
 *
 *   the universe scan sets `skipEstimates`, so it spends no FMP at all. What it
 *   spends is EDGAR and Yahoo requests, and EDGAR is paced by a global minimum
 *   interval, which means scan volume is really a claim on the nightly run's
 *   wall clock — and that run has a 300-second ceiling.
 *
 * Analysing a ticker on demand costs one FMP call and a handful of fundamentals
 * requests, which is why the batch is deliberately smaller than the function
 * could manage: the headroom is there so adding a stock at nine in the evening
 * still has providers to talk to, and so a night that runs long does not eat
 * the watchlist pass, which is the part that matters.
 *
 * FMP's free tier is ~250 requests a day. The watchlist takes ~30 of those and
 * the scan takes none, so on-demand analysis has room for roughly two hundred
 * additions in a day — far more than anyone adds — and the binding constraint
 * is EDGAR and Yahoo volume rather than FMP.
 */

/** Candidates per nightly run, when nothing overrides it. */
export const DEFAULT_SCAN_BATCH = 30;

/**
 * An upper bound, because this is read from the environment.
 *
 * A mistyped value should not be able to point the scan at thousands of
 * tickers in one night: that is the shape of a run that exhausts a provider
 * and takes the watchlist pass down with it.
 */
export const MAX_SCAN_BATCH = 200;

/**
 * Reads `SCAN_BATCH_SIZE`, falling back to the default.
 *
 * Anything that is not a non-negative whole number is treated as unset rather
 * than coerced: `Number('sixty')` is NaN, and passing NaN as a limit produced a
 * scan that quietly evaluated nothing. Zero is allowed and means "skip the
 * scan tonight", which is a legitimate way to leave the whole budget to the
 * watchlist and to manual additions.
 */
export function scanBatchSize(raw: string | undefined = process.env.SCAN_BATCH_SIZE): number {
  if (raw == null || raw.trim() === '') return DEFAULT_SCAN_BATCH;

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return DEFAULT_SCAN_BATCH;
  }

  return Math.min(value, MAX_SCAN_BATCH);
}
