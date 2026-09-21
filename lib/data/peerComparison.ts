/**
 * How a company's key figures compare with the others you follow beside it.
 *
 * ── What the comparison set is, and what it is not ────────────────────
 *
 * This is **not** a sector median, and the copy never calls it one. The app
 * computes ratios for the names on the watchlist and nothing else — thirty-two
 * companies, four to eleven per focus sector — so a median taken from them is
 * the median of a hand-picked list, not of a sector. Presenting it as a sector
 * figure would be a straightforward falsehood: a watchlist is selected, and
 * selected on roughly these metrics, so it is biased in exactly the direction
 * that would make the comparison flattering.
 *
 * What it *is* is still useful, and arguably more useful: these are the
 * companies you are actually choosing between. "Dearer than the other ten
 * technology names you follow" is a decision-relevant fact in a way that
 * "dearer than the S&P technology median" is not, when you are not going to
 * buy the S&P technology median.
 *
 * A real sector median would need the ratio engine run across the screened
 * universe rather than the watchlist. The nightly scan already computes full
 * ratios for every candidate it evaluates and then discards them; persisting
 * a compact row per candidate would build genuine sector coverage over a
 * couple of weeks. That is a larger change and a separate decision.
 */

/**
 * Below this many peers the median is not worth showing.
 *
 * With three others, the "median" is the middle of three numbers and moves
 * entirely if one of them is refreshed. Four is still small, but it is the
 * point at which the comparison stops being a coin toss dressed as a
 * statistic. Entertainment and media currently has four names in total, so
 * this deliberately suppresses that sector rather than flattering it.
 */
export const MIN_PEERS = 4;

/** The figures worth comparing: valuation, returns, margins. */
export const PEER_METRICS = ['pe', 'roe', 'gross_margin', 'net_margin'] as const;
export type PeerMetric = (typeof PEER_METRICS)[number];

export interface PeerRatio {
  symbol: string;
  ratioKey: string;
  value: number | null;
}

export interface PeerComparison {
  metric: PeerMetric;
  own: number;
  median: number;
  /** How many peers the median was taken from, excluding this company. */
  peers: number;
  /** Own value as a percentage difference from the median. */
  differencePercent: number;
}

export interface PeerSummary {
  /** Distinct peer companies with at least one comparable figure. */
  peerCount: number;
  comparisons: PeerComparison[];
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

/**
 * Compares one company against the others on the watchlist in its sector.
 *
 * `peerRows` must already exclude the company itself; passing its own figures
 * in would drag the median towards the thing being measured.
 *
 * Returns null rather than a thin comparison when there are too few peers —
 * see MIN_PEERS. A median of two is not a median.
 */
export function comparePeers(
  own: Map<string, number | null>,
  peerRows: PeerRatio[],
): PeerSummary | null {
  const peerSymbols = new Set(peerRows.map((r) => r.symbol));
  if (peerSymbols.size < MIN_PEERS) return null;

  const comparisons: PeerComparison[] = [];

  for (const metric of PEER_METRICS) {
    const ownValue = own.get(metric);
    if (ownValue == null || !Number.isFinite(ownValue)) continue;

    const values = peerRows
      .filter((r) => r.ratioKey === metric && r.value != null && Number.isFinite(r.value))
      .map((r) => r.value as number);

    // Each metric is gated on its own count: a sector can have eight peers
    // and only two with a usable P/E, and that comparison is as thin as a
    // two-company sector would be.
    if (values.length < MIN_PEERS) continue;

    const mid = median(values);
    if (mid === 0) continue;

    comparisons.push({
      metric,
      own: ownValue,
      median: mid,
      peers: values.length,
      differencePercent: ((ownValue - mid) / Math.abs(mid)) * 100,
    });
  }

  if (comparisons.length === 0) return null;
  return { peerCount: peerSymbols.size, comparisons };
}

/**
 * Whether being above the median is the good direction for this metric.
 *
 * Used only to colour the difference, never to pass or fail anything. A high
 * P/E is expensive; a high return on equity is not the same kind of fact,
 * and rendering both in the same colour because both are "above median"
 * would be worse than leaving them uncoloured.
 */
export function higherIsBetter(metric: PeerMetric): boolean {
  return metric !== 'pe';
}
