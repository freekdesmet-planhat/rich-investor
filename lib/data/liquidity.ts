/**
 * How easily a position can actually be got into and out of.
 *
 * Informational only. It changes no verdict and adds no condition — the nine
 * stay exactly as they are. But execution cost has been invisible in this app
 * so far, and even a large-cap name can be thin enough that it matters.
 *
 * The honest measure here is turnover, not spread. Two reasons, both found by
 * looking at what the provider actually returns rather than at what it
 * documents:
 *
 *   Outside a market's own session, the quoted bid and ask are stale and
 *   wildly wrong. Probed at 07:49 UTC, with the US market in `PREPRE`, Apple
 *   showed a 2.02% spread and ASML 9.44%. Apple's real spread is a fraction
 *   of a basis point. A nightly job runs at 02:00 UTC and would capture
 *   nothing but this.
 *
 *   European listings have no bid or ask at all, even mid-session. ADYEN.AS
 *   and MC.PA both returned zeros while in `REGULAR`. That is most of the
 *   non-US half of this watchlist.
 *
 * So the spread is shown only when it can be trusted — the market open and
 * both sides quoted — and average daily turnover carries the feature the rest
 * of the time. Turnover is the better number for a long-horizon investor
 * anyway: it answers "could I build a position without moving the price",
 * which is the question, where the spread answers "what does one round trip
 * cost" on a holding meant to last years.
 */

/**
 * Below this much traded a day, a position worth building starts to be a
 * meaningful share of the volume.
 *
 * Deliberately a soft line with no verdict attached. Five million dollars a
 * day is thin for a company large enough to clear the $10bn floor, which is
 * what makes it worth a word — not a number anybody should trade on.
 */
export const THIN_TURNOVER_USD = 5_000_000;

/** A spread wider than this on a large cap says the quote is not real. */
const IMPLAUSIBLE_SPREAD_PERCENT = 1;

export interface LiquidityInput {
  price: number | null;
  currency: string | null;
  bid: number | null;
  ask: number | null;
  averageDailyVolume: number | null;
  /** Yahoo's `marketState`: REGULAR, PRE, PREPRE, POST, POSTPOST, CLOSED. */
  marketState: string | null;
}

export interface Liquidity {
  averageDailyVolume: number | null;
  /** Average daily volume × price, in the quote currency. */
  turnover: number | null;
  currency: string | null;
  /** Percent, and only when the quote could be trusted. */
  spreadPercent: number | null;
  /** Why there is no spread, when there is none. */
  spreadUnavailable: 'market_closed' | 'not_quoted' | 'implausible' | null;
  /** Turnover below THIN_TURNOVER_USD. Informational. */
  thin: boolean;
}

/**
 * Reads a quote into the two numbers worth showing.
 *
 * The spread is computed only in `REGULAR` state with both sides quoted, and
 * discarded if the result is implausible anyway. That last check is belt and
 * braces: a market can be open and still return a crossed or stale book in
 * the first seconds of a session, and a 9% spread on a mega-cap is a bad
 * datum rather than a finding.
 */
export function readLiquidity(input: LiquidityInput): Liquidity {
  const { price, bid, ask, averageDailyVolume, marketState } = input;

  const turnover =
    price != null && averageDailyVolume != null ? price * averageDailyVolume : null;

  let spreadPercent: number | null = null;
  let spreadUnavailable: Liquidity['spreadUnavailable'] = null;

  if (marketState !== 'REGULAR') {
    spreadUnavailable = 'market_closed';
  } else if (bid == null || ask == null || bid <= 0 || ask <= 0) {
    spreadUnavailable = 'not_quoted';
  } else {
    const mid = (ask + bid) / 2;
    const percent = ((ask - bid) / mid) * 100;
    if (percent < 0 || percent > IMPLAUSIBLE_SPREAD_PERCENT) {
      spreadUnavailable = 'implausible';
    } else {
      spreadPercent = percent;
    }
  }

  return {
    averageDailyVolume,
    turnover,
    currency: input.currency,
    spreadPercent,
    spreadUnavailable,
    thin: turnover != null && turnover < THIN_TURNOVER_USD,
  };
}
