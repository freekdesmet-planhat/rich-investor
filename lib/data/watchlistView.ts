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

/**
 * Whether you have made your own call on a name yet.
 *
 * A separate axis from the signal status, deliberately: the status is what the
 * numbers say, this is whether you have answered them. A stock can be
 * buy-worthy and unreviewed, which is exactly the combination worth finding.
 */
export type ReviewFilter = 'any' | 'needed' | 'reviewed';

/**
 * The book's three growth bands, as a filter.
 *
 * Separate again from status and from review: the band is what kind of company
 * this is, and it changes what you are looking for — a high-growth name at 7 of
 * 9 is a different proposition from a low-growth one at the same count.
 * 'outside' collects the categories the book puts outside its focus (cyclical,
 * turnaround, financial institution, unknown) rather than pretending they are a
 * fourth band.
 */
export type GrowthFilter = 'any' | 'high_growth' | 'average_growth' | 'low_growth' | 'outside';

/** Sector filter values are the focus sectors themselves, plus 'any'. */
export type SectorFilter = string;

const BANDS = ['high_growth', 'average_growth', 'low_growth'] as const;

export const STATUS_FILTERS: StatusFilter[] = ['all', 'buy_worthy', 'almost', 'watching'];
export const SORT_KEYS: SortKey[] = ['sector', 'conditions', 'drawdown', 'symbol'];
export const REVIEW_FILTERS: ReviewFilter[] = ['any', 'needed', 'reviewed'];
export const GROWTH_FILTERS: GrowthFilter[] = [
  'any',
  'high_growth',
  'average_growth',
  'low_growth',
  'outside',
];

export const isStatusFilter = (value: unknown): value is StatusFilter =>
  typeof value === 'string' && (STATUS_FILTERS as string[]).includes(value);

export const isSortKey = (value: unknown): value is SortKey =>
  typeof value === 'string' && (SORT_KEYS as string[]).includes(value);

export const isReviewFilter = (value: unknown): value is ReviewFilter =>
  typeof value === 'string' && (REVIEW_FILTERS as string[]).includes(value);

export const isGrowthFilter = (value: unknown): value is GrowthFilter =>
  typeof value === 'string' && (GROWTH_FILTERS as string[]).includes(value);

/** Which growth filter a stored Lynch category answers to. */
export function growthBandOf(category: string | null | undefined): GrowthFilter {
  if (!category) return 'outside';
  return (BANDS as readonly string[]).includes(category) ? (category as GrowthFilter) : 'outside';
}

/** The shape this module needs; the query type satisfies it. */
export interface ViewableEntry {
  symbol: string;
  name: string | null;
  focus_sector: string;
  signal: {
    status: 'buy_worthy' | 'almost' | 'watching';
    conditions_met: number;
    conditions_applicable: number;
    lynch_category?: string;
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
  review: ReviewFilter;
  growth: GrowthFilter;
  /** A focus sector key, or 'any'. */
  sector: SectorFilter;
}

/** The part of a saved review this module needs. */
export interface ReviewState {
  assessment: 'temporary' | 'structural' | 'not_assessed';
  assessed_at: string | null;
  /** Fallback date: every row has one, `assessed_at` only once judged. */
  updated_at?: string;
}

/**
 * Has this name been judged?
 *
 * "Not yet assessed" is the form's own default, so a saved review that still
 * holds it is not an answer — it is the absence of one, and it counts the same
 * as never having opened the page. No staleness threshold: how old a judgement
 * may be before it needs revisiting is the reader's call, which is why the row
 * prints the date instead of deciding for them.
 */
export function needsReview(review: ReviewState | null | undefined): boolean {
  return !review || review.assessment === 'not_assessed';
}

export type ReviewLookup = ReadonlyMap<string, ReviewState>;

export type ReviewMark =
  | { done: false }
  | { done: true; assessment: 'temporary' | 'structural'; date: string };

/**
 * What a watchlist row says about your own verdict.
 *
 * Returns the parts rather than the sentence, so the page can put them through
 * next-intl and this can be tested without it. The date falls back to
 * `updated_at` because `assessed_at` is only stamped when a verdict is given —
 * a row that has one always has a date to show for it.
 */
export function reviewMarkOf(review: ReviewState | null | undefined): ReviewMark {
  if (needsReview(review)) return { done: false };
  const r = review as ReviewState & { updated_at?: string };
  return {
    done: true,
    assessment: r.assessment as 'temporary' | 'structural',
    date: (r.assessed_at ?? r.updated_at ?? '').slice(0, 10),
  };
}

export function filterEntries<T extends ViewableEntry>(
  entries: T[],
  options: ViewOptions,
  reviews: ReviewLookup = new Map(),
): T[] {
  const needle = options.query.trim().toLowerCase();

  return entries.filter((entry) => {
    if (options.status !== 'all') {
      // A ticker with no signal yet has no status to match, so a status filter
      // excludes it rather than guessing one for it.
      if (entry.signal?.status !== options.status) return false;
    }
    if (options.review !== 'any') {
      const outstanding = needsReview(reviews.get(entry.symbol));
      if (outstanding !== (options.review === 'needed')) return false;
    }
    if (options.sector !== 'any' && entry.focus_sector !== options.sector) return false;
    if (options.growth !== 'any') {
      // A ticker with no evaluation has no category to match; like the status
      // filter, that excludes it rather than guessing one for it.
      if (!entry.signal) return false;
      if (growthBandOf(entry.signal.lynch_category) !== options.growth) return false;
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
 * Counts per growth band, over the unfiltered list for the same reason.
 *
 * Bands nobody holds still appear, at zero, so the set of chips does not shift
 * about between visits.
 */
export function growthCounts<T extends ViewableEntry>(entries: T[]): Record<GrowthFilter, number> {
  const counts: Record<GrowthFilter, number> = {
    any: entries.length,
    high_growth: 0,
    average_growth: 0,
    low_growth: 0,
    outside: 0,
  };
  for (const entry of entries) {
    if (!entry.signal) continue;
    counts[growthBandOf(entry.signal.lynch_category)] += 1;
  }
  return counts;
}

/** Sectors present on the list, with counts, in the order given. */
export function sectorCounts<T extends ViewableEntry>(
  entries: T[],
  order: readonly string[],
): Array<{ sector: string; count: number }> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.focus_sector, (counts.get(entry.focus_sector) ?? 0) + 1);
  }
  return order
    .filter((sector) => counts.has(sector))
    .map((sector) => ({ sector, count: counts.get(sector)! }));
}

/** Counts for the review chips, over the unfiltered list for the same reason. */
export function reviewCounts<T extends ViewableEntry>(
  entries: T[],
  reviews: ReviewLookup = new Map(),
): Record<ReviewFilter, number> {
  const needed = entries.filter((e) => needsReview(reviews.get(e.symbol))).length;
  return { any: entries.length, needed, reviewed: entries.length - needed };
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
  if (next.review !== 'any') params.set('review', next.review);
  if (next.growth !== 'any') params.set('growth', next.growth);
  if (next.sector !== 'any') params.set('sector', next.sector);
  if (next.query.trim()) params.set('q', next.query.trim());
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}
