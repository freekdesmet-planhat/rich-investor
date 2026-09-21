import { describe, expect, it } from 'vitest';
import { comparePeers, higherIsBetter, MIN_PEERS, type PeerRatio } from './peerComparison';

const rows = (values: Record<string, number[]>): PeerRatio[] =>
  Object.entries(values).flatMap(([ratioKey, list]) =>
    list.map((value, i) => ({ symbol: `PEER${i}`, ratioKey, value })),
  );

describe('comparePeers', () => {
  it('compares each metric against the median of its peers', () => {
    const summary = comparePeers(
      new Map([['pe', 30]]),
      rows({ pe: [10, 20, 20, 30] }),
    )!;

    expect(summary.peerCount).toBe(4);
    expect(summary.comparisons).toHaveLength(1);
    expect(summary.comparisons[0]).toMatchObject({ metric: 'pe', own: 30, median: 20, peers: 4 });
    expect(summary.comparisons[0].differencePercent).toBe(50);
  });

  it('reports being below the median as a negative difference', () => {
    const summary = comparePeers(new Map([['pe', 10]]), rows({ pe: [20, 20, 20, 20] }))!;
    expect(summary.comparisons[0].differencePercent).toBe(-50);
  });

  it('takes the midpoint when the peer count is even', () => {
    const summary = comparePeers(new Map([['roe', 0.1]]), rows({ roe: [0.1, 0.2, 0.3, 0.4] }))!;
    expect(summary.comparisons[0].median).toBeCloseTo(0.25, 6);
  });

  /** A median of two is not a median. */
  it('refuses a comparison set that is too small', () => {
    expect(comparePeers(new Map([['pe', 30]]), rows({ pe: [10, 20] }))).toBeNull();
    expect(MIN_PEERS).toBe(4);
  });

  /**
   * A sector can have plenty of peers and only two with a usable figure for
   * one metric — a loss-making company has no P/E. That metric is as thin as
   * a two-company sector and is dropped on its own.
   */
  it('gates each metric on its own usable count', () => {
    const peerRows: PeerRatio[] = [
      ...rows({ roe: [0.1, 0.2, 0.3, 0.4] }),
      // Four peers overall, but only two report a P/E.
      { symbol: 'PEER0', ratioKey: 'pe', value: 10 },
      { symbol: 'PEER1', ratioKey: 'pe', value: 20 },
      { symbol: 'PEER2', ratioKey: 'pe', value: null },
      { symbol: 'PEER3', ratioKey: 'pe', value: null },
    ];

    const summary = comparePeers(new Map([['pe', 30], ['roe', 0.5]]), peerRows)!;
    expect(summary.comparisons.map((c) => c.metric)).toEqual(['roe']);
  });

  it('skips a metric this company has no figure for', () => {
    const summary = comparePeers(
      new Map([['pe', null], ['roe', 0.5]]),
      rows({ pe: [10, 20, 30, 40], roe: [0.1, 0.2, 0.3, 0.4] }),
    )!;
    expect(summary.comparisons.map((c) => c.metric)).toEqual(['roe']);
  });

  it('refuses to divide by a median of zero', () => {
    expect(comparePeers(new Map([['net_margin', 0.1]]), rows({ net_margin: [-0.1, 0, 0, 0.1] }))).toBeNull();
  });

  it('returns nothing when no metric survives', () => {
    expect(comparePeers(new Map(), rows({ pe: [10, 20, 30, 40] }))).toBeNull();
  });
});

describe('higherIsBetter', () => {
  /**
   * Colour only, never a verdict. A high P/E is expensive; a high return on
   * equity is not the same kind of fact, and colouring both green for being
   * above the median would be worse than colouring neither.
   */
  it('knows that a high multiple is not the same as a high return', () => {
    expect(higherIsBetter('pe')).toBe(false);
    expect(higherIsBetter('roe')).toBe(true);
    expect(higherIsBetter('gross_margin')).toBe(true);
    expect(higherIsBetter('net_margin')).toBe(true);
  });
});
