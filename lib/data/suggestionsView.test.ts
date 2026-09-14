/**
 * Reading the suggestion feed.
 *
 * The cases worth pinning are the ones a reader would notice as a lie: a tab
 * count that disagrees with what the tab shows, a dismissal that claims days
 * remaining after it has lapsed, and a sort that buries the buy-worthy card
 * under three that are merely close.
 */
import { describe, expect, it } from 'vitest';
import {
  dismissalDaysLeft,
  sortSuggestions,
  suggestionHref,
  suggestionsFor,
  tabCounts,
  type ViewableSuggestion,
} from './suggestionsView';

const row = (
  symbol: string,
  overrides: Partial<ViewableSuggestion> = {},
): ViewableSuggestion => ({
  symbol,
  name: `${symbol} Inc.`,
  state: 'pending',
  status: 'almost',
  suggested_at: '2026-09-01',
  rejected_until: null,
  ...overrides,
});

const rows = [
  row('AAA'),
  row('BBB', { state: 'rejected', rejected_until: '2026-12-01' }),
  row('CCC', { state: 'accepted' }),
  row('DDD'),
];

describe('tabs', () => {
  it('counts every state', () => {
    expect(tabCounts(rows)).toEqual({ pending: 2, rejected: 1, accepted: 1 });
  });

  it('shows exactly what the count promised', () => {
    const counts = tabCounts(rows);
    for (const tab of ['pending', 'rejected', 'accepted'] as const) {
      expect(suggestionsFor(rows, tab)).toHaveLength(counts[tab]);
    }
  });

  /** The archive the audit asked for: what the engine surfaced and you turned down. */
  it('keeps dismissals reachable rather than dropping them', () => {
    expect(suggestionsFor(rows, 'rejected').map((r) => r.symbol)).toEqual(['BBB']);
  });
});

describe('sortSuggestions', () => {
  const feed = [
    row('OLD', { suggested_at: '2026-08-01', status: 'buy_worthy' }),
    row('NEW', { suggested_at: '2026-09-10', status: 'watching' }),
    row('MID', { suggested_at: '2026-09-01', status: 'almost' }),
  ];

  it('puts the newest first by default', () => {
    expect(sortSuggestions(feed, 'newest').map((r) => r.symbol)).toEqual(['NEW', 'MID', 'OLD']);
  });

  it('can put the closest to buyable first', () => {
    expect(sortSuggestions(feed, 'status').map((r) => r.symbol)).toEqual(['OLD', 'MID', 'NEW']);
  });

  it('can order by ticker', () => {
    expect(sortSuggestions(feed, 'symbol').map((r) => r.symbol)).toEqual(['MID', 'NEW', 'OLD']);
  });

  it('breaks ties on the ticker, so the order does not wobble', () => {
    const sameDay = [row('ZZZ'), row('AAA'), row('MMM')];
    expect(sortSuggestions(sameDay, 'newest').map((r) => r.symbol)).toEqual(['AAA', 'MMM', 'ZZZ']);
  });

  it('does not mutate what it was given', () => {
    const original = [...feed];
    sortSuggestions(feed, 'symbol');
    expect(feed).toEqual(original);
  });
});

describe('dismissalDaysLeft', () => {
  const now = new Date('2026-09-14T09:00:00Z');

  it('counts the days a dismissal still has to run', () => {
    expect(dismissalDaysLeft('2026-12-13', now)).toBe(90);
    expect(dismissalDaysLeft('2026-09-15', now)).toBe(1);
  });

  /** Once it lapses the scan may raise it again; "0 days" would imply otherwise. */
  it('says nothing once the window has passed', () => {
    expect(dismissalDaysLeft('2026-09-14', now)).toBeNull();
    expect(dismissalDaysLeft('2026-09-01', now)).toBeNull();
  });

  it('says nothing when there is no window', () => {
    expect(dismissalDaysLeft(null, now)).toBeNull();
    expect(dismissalDaysLeft(undefined, now)).toBeNull();
    expect(dismissalDaysLeft('not-a-date', now)).toBeNull();
  });
});

describe('suggestionHref', () => {
  const view = { tab: 'pending', sort: 'newest' } as const;

  it('keeps the defaults out of the URL', () => {
    expect(suggestionHref(view, { tab: 'pending' })).toBe('/suggestions');
    expect(suggestionHref(view, { sort: 'newest' })).toBe('/suggestions');
  });

  it('carries the rest of the view when one part changes', () => {
    const href = suggestionHref({ tab: 'rejected', sort: 'newest' }, { sort: 'symbol' });
    expect(href).toContain('tab=rejected');
    expect(href).toContain('sort=symbol');
  });
});
