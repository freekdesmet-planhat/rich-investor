/**
 * How rare a deep decline has been, and how long recovery took.
 *
 * Context, not a condition. It changes no verdict and adds nothing to the
 * nine; it answers two questions the decline trigger raises but cannot
 * answer on its own — how unusual is a fall this deep, and if I buy it, how
 * long might I be waiting.
 *
 * ── What this data is, and what it is not ──────────────────────────────
 *
 * These figures describe the **US market as a whole**, from SBBI's
 * historical bear-market table: seventeen declines of more than 20% in real
 * terms since 1870, of which exactly two went past 50%.
 *
 * They do not describe an individual company, and the difference is not
 * pedantic — it is the entire risk. A single stock falling 50% is ordinary;
 * it happens to good companies several times a decade and to bad ones once,
 * permanently. The index falling 50% has happened twice in a century and a
 * half. Presenting market odds beside a single stock's drawdown, without
 * saying which is which, would tell a reader that a 55% fall in one company
 * is a once-in-75-years event. It is not, and acting on that belief is
 * exactly the mistake the qualitative review exists to prevent.
 *
 * So every string this module produces is explicitly about the market, and
 * the copy says so. What the reader takes from it should be "the 50%
 * threshold is demanding by the standards of market history, and recoveries
 * have been slow" — not "this company is unlikely to fall further".
 */

/**
 * SBBI's real-terms bear-market table, as summarised in its 2021 edition.
 *
 * Kept as data rather than prose so the copy and the arithmetic cannot drift
 * apart — the "15 of 17" below is computed, not typed.
 */
export const MARKET_DECLINES = {
  /** Declines worse than 20% in real terms since 1870. */
  total: 17,
  since: 1870,
  /** Of those, the ones that went past 50%. */
  past50: [
    { label: '1929', depthPercent: 79 },
    { label: '2000–09', depthPercent: 54 },
  ],
  recovery: { fastestMonths: 20, slowestYears: 13 },
} as const;

export type DeclineSeverity = 'shallow' | 'meaningful' | 'deep';

export interface DeclineContext {
  severity: DeclineSeverity;
  /** The stock's own decline, as a positive percentage. */
  declinePercent: number;
  /** Market declines since 1870 that went deeper than this one. */
  deeperInHistory: number;
  totalDeclines: number;
  fastestRecoveryMonths: number;
  slowestRecoveryYears: number;
}

/**
 * Frames a stock's drawdown against market history.
 *
 * Takes the drawdown as the app stores it — a negative fraction, where
 * -0.55 is a 55% fall.
 *
 * The three bands are about which sentence is worth saying, not about
 * grading the stock:
 *
 *   shallow     under 20%, below anything in the table; nothing to compare
 *   meaningful  20–50%, the range most of the seventeen sit in
 *   deep        past 50%, which only two of the seventeen reached
 */
export function declineContext(drawdown: number | null | undefined): DeclineContext | null {
  if (drawdown == null || !Number.isFinite(drawdown) || drawdown >= 0) return null;

  const declinePercent = Math.abs(drawdown) * 100;

  const severity: DeclineSeverity =
    declinePercent >= 50 ? 'deep' : declinePercent >= 20 ? 'meaningful' : 'shallow';

  // How many of the two recorded 50%+ declines were deeper than this one.
  // Below 50% every one of the seventeen that is deeper cannot be counted
  // from the summary table, so this is only meaningful in the `deep` band —
  // which is the only band whose copy uses it.
  const deeperInHistory = MARKET_DECLINES.past50.filter(
    (d) => d.depthPercent > declinePercent,
  ).length;

  return {
    severity,
    declinePercent,
    deeperInHistory,
    totalDeclines: MARKET_DECLINES.total,
    fastestRecoveryMonths: MARKET_DECLINES.recovery.fastestMonths,
    slowestRecoveryYears: MARKET_DECLINES.recovery.slowestYears,
  };
}
