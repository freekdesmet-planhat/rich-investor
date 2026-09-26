import Link from 'next/link';
import {
  GROWTH_FILTERS,
  REVIEW_FILTERS,
  SORT_KEYS,
  STATUS_FILTERS,
  viewHref,
  type GrowthFilter,
  type ReviewFilter,
  type SortKey,
  type StatusFilter,
  type ViewOptions,
} from '@/lib/data/watchlistView';

export interface ControlLabels {
  /** One per status filter, including "all". */
  status: Record<StatusFilter, string>;
  sortBy: string;
  sort: Record<SortKey, string>;
  filterPlaceholder: string;
  filterApply: string;
  clear: string;
  /** One per review filter, including "any". */
  review: Record<ReviewFilter, string>;
  reviewBy: string;
  /** One per growth band, including "any". */
  growth: Record<GrowthFilter, string>;
  growthBy: string;
  sectorBy: string;
  anySector: string;
  /** Translated name per focus-sector key. */
  sector: Record<string, string>;
}

/**
 * The filter chips, the sort links and the text filter.
 *
 * All of it is links and a GET form rather than client state: the view lives in
 * the URL, so it survives a reload, can be shared, and works before any
 * JavaScript has run. It is also what lets the whole page stay a server
 * component.
 */
export function WatchlistControls({
  view,
  counts,
  reviewCounts,
  growthCounts,
  sectors,
  labels,
}: {
  view: ViewOptions;
  counts: Record<StatusFilter, number>;
  reviewCounts: Record<ReviewFilter, number>;
  growthCounts: Record<GrowthFilter, number>;
  /** Sectors present on the list, with counts, in the book's own order. */
  sectors: Array<{ sector: string; count: number }>;
  labels: ControlLabels;
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition ${
      active
        ? 'border-accent bg-accent font-medium text-accent-ink'
        : 'border-line-strong text-ink-muted hover:bg-surface-hover'
    }`;

  const isFiltered =
    view.status !== 'all' ||
    view.query.trim() !== '' ||
    view.sort !== 'conditions' ||
    view.review !== 'any' ||
    view.growth !== 'any' ||
    view.sector !== 'any';

  return (
    <div className="mb-4 space-y-3">
      {/* The counters, now clickable. A status nobody holds is still shown, at
          zero, so the set of chips does not shift about between visits. */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((status) => (
          <Link
            key={status}
            href={viewHref(view, { status })}
            aria-current={view.status === status ? 'true' : undefined}
            className={chip(view.status === status)}
          >
            {labels.status[status]}
            <span className="ml-1.5 tabular-nums opacity-70">{counts[status]}</span>
          </Link>
        ))}
      </div>

      {/* A second axis, kept visibly apart from the status chips: the status is
          what the numbers say about a stock, this is whether you have answered
          them. Crossing the two is the point — "buy-worthy and I have not
          looked at it yet" is the set worth a Saturday morning. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-subtle text-xs">{labels.reviewBy}:</span>
        {REVIEW_FILTERS.map((review) => (
          <Link
            key={review}
            href={viewHref(view, { review })}
            aria-current={view.review === review ? 'true' : undefined}
            className={chip(view.review === review)}
          >
            {labels.review[review]}
            <span className="ml-1.5 tabular-nums opacity-70">{reviewCounts[review]}</span>
          </Link>
        ))}
      </div>

      {/* What kind of company, which is a different question from how close it
          is to buyable: a high-growth name at 7 of 9 and a low-growth one at the
          same count are not the same proposition. Bands nobody holds still show,
          at zero, so the row does not reshuffle between visits. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-subtle text-xs">{labels.growthBy}:</span>
        {GROWTH_FILTERS.map((growth) => (
          <Link
            key={growth}
            href={viewHref(view, { growth })}
            aria-current={view.growth === growth ? 'true' : undefined}
            className={chip(view.growth === growth)}
          >
            {labels.growth[growth]}
            <span className="ml-1.5 tabular-nums opacity-70">{growthCounts[growth]}</span>
          </Link>
        ))}
      </div>

      {/* Sector is a select rather than chips: five of them plus counts would
          wrap to three lines on a phone, and unlike the bands this list is
          whatever happens to be on the watchlist. */}
      {sectors.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-subtle text-xs">{labels.sectorBy}:</span>
          <span className="flex flex-wrap items-center gap-2">
            <Link
              href={viewHref(view, { sector: 'any' })}
              aria-current={view.sector === 'any' ? 'true' : undefined}
              className={chip(view.sector === 'any')}
            >
              {labels.anySector}
            </Link>
            {sectors.map(({ sector, count }) => (
              <Link
                key={sector}
                href={viewHref(view, { sector })}
                aria-current={view.sector === sector ? 'true' : undefined}
                className={chip(view.sector === sector)}
              >
                {labels.sector[sector] ?? sector}
                <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
              </Link>
            ))}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-subtle">{labels.sortBy}:</span>
          {SORT_KEYS.map((sort) => (
            <Link
              key={sort}
              href={viewHref(view, { sort })}
              aria-current={view.sort === sort ? 'true' : undefined}
              className={
                view.sort === sort
                  ? 'font-medium text-ink underline underline-offset-4'
                  : 'text-ink-subtle underline-offset-4 hover:text-ink hover:underline'
              }
            >
              {labels.sort[sort]}
            </Link>
          ))}
        </div>

        {/* A GET form, so the text filter lands in the URL like the rest. The
            other options ride along as hidden fields or they would be lost.
            Full width on a phone so the Apply button drops to its own line
            instead of being pushed past the edge (it took the page to 445px at
            390px); it shares the row again from sm up. */}
        <form
          method="GET"
          action="/"
          className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1"
        >
          {view.status !== 'all' && <input type="hidden" name="status" value={view.status} />}
          {view.sort !== 'conditions' && <input type="hidden" name="sort" value={view.sort} />}
          {view.review !== 'any' && <input type="hidden" name="review" value={view.review} />}
          {view.growth !== 'any' && <input type="hidden" name="growth" value={view.growth} />}
          {view.sector !== 'any' && <input type="hidden" name="sector" value={view.sector} />}
          <input
            type="search"
            name="q"
            defaultValue={view.query}
            placeholder={labels.filterPlaceholder}
            aria-label={labels.filterPlaceholder}
            className="bg-surface border-line-strong min-w-0 flex-1 rounded-md border px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="border-line-strong text-ink-muted hover:bg-surface-hover shrink-0 rounded-md border px-3 py-1.5 text-xs transition"
          >
            {labels.filterApply}
          </button>
        </form>

        {isFiltered && (
          <Link
            href="/"
            className="text-ink-subtle shrink-0 text-xs underline underline-offset-2"
          >
            {labels.clear}
          </Link>
        )}
      </div>
    </div>
  );
}
