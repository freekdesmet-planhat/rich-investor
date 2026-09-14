/**
 * Filtering and sorting the watchlist.
 *
 * The parts worth pinning down are the ones a reader would notice as a lie:
 * a chip whose count disagrees with what it shows, a "deepest decline" order
 * that is upside down because the value is stored negative, and a ticker with
 * no analysis floating to the top of "most conditions met".
 */
import { describe, expect, it } from 'vitest';
import {
  drawdownOf,
  filterEntries,
  needsReview,
  reviewCounts,
  reviewMarkOf,
  sortEntries,
  statusCounts,
  viewHref,
  type ReviewState,
  type ViewOptions,
  type ViewableEntry,
} from './watchlistView';

const entry = (
  symbol: string,
  overrides: Partial<ViewableEntry> & {
    status?: 'buy_worthy' | 'almost' | 'watching';
    met?: number;
    applicable?: number;
    drawdown?: number | null;
  } = {},
): ViewableEntry => {
  const { status = 'watching', met = 5, applicable = 9, drawdown = -0.2, ...rest } = overrides;
  return {
    symbol,
    name: `${symbol} Inc.`,
    focus_sector: 'information_technology',
    signal: {
      status,
      conditions_met: met,
      conditions_applicable: applicable,
      // The engine stores a decline as a negative number.
      checklist: [{ key: 'drawdown', value: drawdown }],
    },
    ...rest,
  };
};

const pending = (symbol: string): ViewableEntry => ({
  symbol,
  name: `${symbol} Inc.`,
  focus_sector: 'information_technology',
  signal: null,
});

const view = (overrides: Partial<ViewOptions> = {}): ViewOptions => ({
  status: 'all',
  sort: 'sector',
  query: '',
  review: 'any',
  ...overrides,
});

const reviewed = (
  assessment: ReviewState['assessment'] = 'temporary',
  assessed_at: string | null = '2026-03-01T10:00:00Z',
): ReviewState => ({ assessment, assessed_at });

describe('counting for the chips', () => {
  it('counts every status, including ones nobody holds', () => {
    const counts = statusCounts([
      entry('A', { status: 'buy_worthy' }),
      entry('B', { status: 'almost' }),
      entry('C'),
      pending('D'),
    ]);

    expect(counts).toEqual({ all: 4, buy_worthy: 1, almost: 1, watching: 1 });
  });

  it('counts a not-yet-analysed ticker in the total but under no status', () => {
    const counts = statusCounts([pending('D')]);
    expect(counts.all).toBe(1);
    expect(counts.buy_worthy + counts.almost + counts.watching).toBe(0);
  });
});

describe('filtering', () => {
  const rows = [
    entry('ADBE', { status: 'buy_worthy' }),
    entry('GOOGL', { status: 'almost' }),
    entry('MSFT'),
    pending('SHOP'),
  ];

  it('keeps everything by default', () => {
    expect(filterEntries(rows, view()).map((r) => r.symbol)).toEqual([
      'ADBE',
      'GOOGL',
      'MSFT',
      'SHOP',
    ]);
  });

  it('narrows to one status', () => {
    expect(filterEntries(rows, view({ status: 'almost' })).map((r) => r.symbol)).toEqual(['GOOGL']);
  });

  /** It has no status yet, so a status filter cannot honestly include it. */
  it('excludes a not-yet-analysed ticker from any status filter', () => {
    expect(filterEntries(rows, view({ status: 'watching' })).map((r) => r.symbol)).toEqual(['MSFT']);
  });

  it('matches a ticker or a company name, case-insensitively', () => {
    expect(filterEntries(rows, view({ query: 'goog' })).map((r) => r.symbol)).toEqual(['GOOGL']);
    expect(filterEntries(rows, view({ query: 'msft inc' })).map((r) => r.symbol)).toEqual(['MSFT']);
  });

  it('combines a status with the text', () => {
    const result = filterEntries(rows, view({ status: 'buy_worthy', query: 'adbe' }));
    expect(result.map((r) => r.symbol)).toEqual(['ADBE']);
  });

  it('returns nothing rather than everything when nothing matches', () => {
    expect(filterEntries(rows, view({ query: 'zzzz' }))).toEqual([]);
  });
});

describe('sorting', () => {
  it('puts the deepest decline first, despite the value being negative', () => {
    const rows = [
      entry('SHALLOW', { drawdown: -0.1 }),
      entry('DEEP', { drawdown: -0.66 }),
      entry('MIDDLE', { drawdown: -0.35 }),
    ];

    expect(sortEntries(rows, 'drawdown').map((r) => r.symbol)).toEqual([
      'DEEP',
      'MIDDLE',
      'SHALLOW',
    ]);
  });

  it('ranks by share of conditions met, not the raw count', () => {
    const rows = [
      entry('SEVEN_OF_NINE', { met: 7, applicable: 9 }),
      entry('SEVEN_OF_EIGHT', { met: 7, applicable: 8 }),
    ];

    expect(sortEntries(rows, 'conditions')[0].symbol).toBe('SEVEN_OF_EIGHT');
  });

  it('sorts by ticker when asked', () => {
    const rows = [entry('MSFT'), entry('ADBE'), entry('NVDA')];
    expect(sortEntries(rows, 'symbol').map((r) => r.symbol)).toEqual(['ADBE', 'MSFT', 'NVDA']);
  });

  it('keeps closest-to-buying first within the sector ordering', () => {
    const rows = [
      entry('C'),
      entry('A', { status: 'buy_worthy', met: 9 }),
      entry('B', { status: 'almost', met: 8 }),
    ];
    expect(sortEntries(rows, 'sector').map((r) => r.symbol)).toEqual(['A', 'B', 'C']);
  });

  /**
   * A ticker added today has no analysis. Floating it to the top of "most
   * conditions met" would be a claim about a stock nobody has evaluated.
   */
  it('sorts the not-yet-analysed last under every key', () => {
    const rows = [pending('NEW'), entry('OLD', { met: 1, drawdown: -0.01 })];

    for (const key of ['sector', 'conditions', 'drawdown', 'symbol'] as const) {
      expect(sortEntries(rows, key).map((r) => r.symbol), key).toEqual(['OLD', 'NEW']);
    }
  });

  it('does not mutate what it was given', () => {
    const rows = [entry('B'), entry('A')];
    const before = rows.map((r) => r.symbol);
    sortEntries(rows, 'symbol');
    expect(rows.map((r) => r.symbol)).toEqual(before);
  });
});

describe('drawdownOf', () => {
  it('reports a decline as a positive magnitude', () => {
    expect(drawdownOf(entry('X', { drawdown: -0.66 }))).toBeCloseTo(0.66);
  });

  it('is null when there is nothing to read', () => {
    expect(drawdownOf(pending('X'))).toBeNull();
    expect(drawdownOf(entry('X', { drawdown: null }))).toBeNull();
  });
});

describe('building the links', () => {
  it('keeps the rest of the view when one thing changes', () => {
    const href = viewHref(view({ status: 'almost', query: 'ads' }), { sort: 'drawdown' });
    expect(href).toContain('status=almost');
    expect(href).toContain('sort=drawdown');
    expect(href).toContain('q=ads');
  });

  it('leaves defaults out, so the common case has a clean URL', () => {
    expect(viewHref(view(), { status: 'all' })).toBe('/');
    expect(viewHref(view({ sort: 'symbol' }), { sort: 'sector' })).toBe('/');
  });

  it('does not drop the typed filter when a chip is clicked', () => {
    expect(viewHref(view({ query: 'nvidia' }), { status: 'buy_worthy' })).toContain('q=nvidia');
  });
});

describe('whether a name still needs your own judgement', () => {
  it('counts a missing review as outstanding', () => {
    expect(needsReview(undefined)).toBe(true);
    expect(needsReview(null)).toBe(true);
  });

  /** The form's default is not an answer, however long ago it was saved. */
  it('counts a saved "not yet assessed" as outstanding too', () => {
    expect(needsReview(reviewed('not_assessed'))).toBe(true);
  });

  it('counts either verdict as answered', () => {
    expect(needsReview(reviewed('temporary'))).toBe(false);
    expect(needsReview(reviewed('structural'))).toBe(false);
  });

  it('splits the list in two and the halves add up', () => {
    const rows = [entry('ADBE'), entry('GOOGL'), entry('MSFT')];
    const reviews = new Map([['ADBE', reviewed('structural')]]);

    const counts = reviewCounts(rows, reviews);
    expect(counts).toEqual({ any: 3, needed: 2, reviewed: 1 });
    expect(counts.needed + counts.reviewed).toBe(counts.any);
  });

  it('filters to the ones you have not answered', () => {
    const rows = [entry('ADBE'), entry('GOOGL')];
    const reviews = new Map([['ADBE', reviewed()]]);

    expect(filterEntries(rows, view({ review: 'needed' }), reviews).map((r) => r.symbol)).toEqual([
      'GOOGL',
    ]);
    expect(filterEntries(rows, view({ review: 'reviewed' }), reviews).map((r) => r.symbol)).toEqual([
      'ADBE',
    ]);
  });

  /** The point of the axis: buy-worthy *and* unanswered is the useful set. */
  it('combines with the status filter rather than replacing it', () => {
    const rows = [
      entry('ADBE', { status: 'buy_worthy' }),
      entry('GOOGL', { status: 'buy_worthy' }),
      entry('MSFT', { status: 'watching' }),
    ];
    const reviews = new Map([['ADBE', reviewed()]]);

    const result = filterEntries(rows, view({ status: 'buy_worthy', review: 'needed' }), reviews);
    expect(result.map((r) => r.symbol)).toEqual(['GOOGL']);
  });

  it('is off by default, and says so in the URL when it is not', () => {
    expect(viewHref(view(), { review: 'any' })).toBe('/');
    expect(viewHref(view(), { review: 'needed' })).toContain('review=needed');
    expect(viewHref(view({ query: 'ads' }), { review: 'needed' })).toContain('q=ads');
  });
});

describe('what a row says about your verdict', () => {
  it('says nothing to show when there is no verdict', () => {
    expect(reviewMarkOf(undefined)).toEqual({ done: false });
    expect(reviewMarkOf(reviewed('not_assessed'))).toEqual({ done: false });
  });

  it('carries the verdict and the day it was made', () => {
    expect(reviewMarkOf(reviewed('structural', '2026-03-04T09:30:00Z'))).toEqual({
      done: true,
      assessment: 'structural',
      date: '2026-03-04',
    });
  });

  /** A review saved before assessed_at was stamped still has a date to show. */
  it('falls back to when the row was last written', () => {
    const mark = reviewMarkOf({
      assessment: 'temporary',
      assessed_at: null,
      updated_at: '2026-05-20T08:00:00Z',
    });
    expect(mark).toEqual({ done: true, assessment: 'temporary', date: '2026-05-20' });
  });
});
