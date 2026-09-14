/**
 * Filtering and sorting the watchlist.
 *
 * 27 rows in four sector groups, with the counts in the header announcing "1
 * buy-worthy · 2 almost there" and then leaving you to scroll for them. The
 * counters are the obvious filter, so they became one.
 *
 * Pure, and kept out of `queries.ts`, which carries the `server-only` guard a
 * unit test cannot load. Everything here works on a structural shape rather
 * than the query type, so the sorting can be tested without a database.
 */

export type StatusFilter = 'all' | 'buy_worthy' | 'almost' | 'watching';
export type SortKey = 'sector' | 'conditions' | 'drawdown' | 'symbol';

export const STATUS_FILTERS: StatusFilter[] = ['all', 'buy_worthy', 'almost', 'watching'];
export const SORT_KEYS: SortKey[] = ['sector', 'conditions', 'drawdown', 'symbol'];

export const isStatusFilter = (value: unknown): value is StatusFilter =>
  typeof value === 'string' && (STATUS_FILTERS as string[]).includes(value);

export const isSortKey = (value: unknown): value is SortKey =>
  typeof value === 'string' && (SORT_KEYS as string[]).includes(value);

/** The shape this module needs; the query type satisfies it. */
export interface ViewableEntry {
  symbol: string;
  name: string | null;
  focus_sector: string;
  signal: {
    status: 'buy_worthy' | 'almost' | 'watching';
    conditions_met: number;
    conditions_applicable: number;
    checklist: Array<{ key: string; value: number | null }>;
  } | null;
}

/**
 * How far below the 5-year high, as a positive fraction.
 *
 * The condition stores it the way the ratio engine produces it — negative,
 * because it is a decline — so a "deepest first" sort has to agree on a
 * direction. Null when the ticker has not been evaluated.
 */
export function drawdownOf(entry: ViewableEntry): number | null {
  const value = entry.signal?.checklist?.find((c) => c.key === 'drawdown')?.value;
  return value == null ? null : Math.abs(value);
}

/** Share of applicable conditions met, so a 8/9 outranks a 7/8 fairly. */
function completion(entry: ViewableEntry): number {
  if (!entry.signal || entry.signal.conditions_applicable === 0) return -1;
  return entry.signal.conditions_met / entry.signal.conditions_applicable;
}

export interface ViewOptions {
  status: StatusFilter;
  sort: SortKey;
  /** Free text over ticker and company name. */
  query: string;
}

export function filterEntries<T extends ViewableEntry>(entries: T[], options: ViewOptions): T[] {
  const needle = options.query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (options.status !== 'all') {
      // A ticker with no signal yet has no status to match, so a status filter
      // excludes it rather than guessing one for it.
      if (entry.signal?.status !== options.status) return false;
    }
    if (needle) {
      const haystack = `${entry.symbol} ${entry.name ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/**
 * Orders the rows.
 *
 * Anything not yet evaluated sorts last under every key: it has nothing to say,
 * and floating it to the top of "most conditions met" would be actively
 * misleading.
 */
export function sortEntries<T extends ViewableEntry>(entries: T[], sort: SortKey): T[] {
  const rank = { buy_worthy: 0, almost: 1, watching: 2 } as const;
  const unevaluated = (e: T) => (e.signal ? 0 : 1);

  return [...entries].sort((a, b) => {
    const pending = unevaluated(a) - unevaluated(b);
    if (pending !== 0) return pending;

    switch (sort) {
      case 'conditions':
        return (
          completion(b) - completion(a) ||
          (b.signal?.conditions_met ?? 0) - (a.signal?.conditions_met ?? 0) ||
          a.symbol.localeCompare(b.symbol)
        );
      case 'drawdown': {
        // Deepest decline first — that is the book's entry signal.
        const left = drawdownOf(a);
        const right = drawdownOf(b);
        if (left == null && right == null) return a.symbol.localeCompare(b.symbol);
        if (left == null) return 1;
        if (right == null) return -1;
        return right - left || a.symbol.localeCompare(b.symbol);
      }
      case 'symbol':
        return a.symbol.localeCompare(b.symbol);
      case 'sector':
      default:
        // Within a sector the old ordering still applies: closest to buying first.
        return (
          (a.signal ? rank[a.signal.status] : 3) - (b.signal ? rank[b.signal.status] : 3) ||
          completion(b) - completion(a) ||
          a.symbol.localeCompare(b.symbol)
        );
    }
  });
}

/** Counts for the filter chips, always over the unfiltered list. */
export function statusCounts<T extends ViewableEntry>(
  entries: T[],
): Record<StatusFilter, number> {
  return {
    all: entries.length,
    buy_worthy: entries.filter((e) => e.signal?.status === 'buy_worthy').length,
    almost: entries.filter((e) => e.signal?.status === 'almost').length,
    watching: entries.filter((e) => e.signal?.status === 'watching').length,
  };
}

/**
 * Builds the querystring for a chip or sort link, keeping the rest of the view.
 *
 * Changing the filter must not silently drop the text you typed, and the
 * default value is omitted so the common case has a clean URL.
 */
export function viewHref(current: ViewOptions, change: Partial<ViewOptions>): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.status !== 'all') params.set('status', next.status);
  if (next.sort !== 'sector') params.set('sort', next.sort);
  if (next.query.trim()) params.set('q', next.query.trim());
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}
