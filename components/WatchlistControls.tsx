import Link from 'next/link';
import {
  REVIEW_FILTERS,
  SORT_KEYS,
  STATUS_FILTERS,
  viewHref,
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
  labels,
}: {
  view: ViewOptions;
  counts: Record<StatusFilter, number>;
  reviewCounts: Record<ReviewFilter, number>;
  labels: ControlLabels;
}) {
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition ${
      active
        ? 'border-slate-900 bg-slate-900 font-medium text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
        : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
    }`;

  const isFiltered =
    view.status !== 'all' ||
    view.query.trim() !== '' ||
    view.sort !== 'sector' ||
    view.review !== 'any';

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
        <span className="text-xs text-slate-500 dark:text-slate-400">{labels.reviewBy}:</span>
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500 dark:text-slate-400">{labels.sortBy}:</span>
          {SORT_KEYS.map((sort) => (
            <Link
              key={sort}
              href={viewHref(view, { sort })}
              aria-current={view.sort === sort ? 'true' : undefined}
              className={
                view.sort === sort
                  ? 'font-medium text-slate-900 underline underline-offset-4 dark:text-slate-100'
                  : 'text-slate-500 underline-offset-4 hover:underline dark:text-slate-400'
              }
            >
              {labels.sort[sort]}
            </Link>
          ))}
        </div>

        {/* A GET form, so the text filter lands in the URL like the rest. The
            other options ride along as hidden fields or they would be lost. */}
        <form method="GET" action="/" className="flex min-w-0 flex-1 items-center gap-2">
          {view.status !== 'all' && <input type="hidden" name="status" value={view.status} />}
          {view.sort !== 'sector' && <input type="hidden" name="sort" value={view.sort} />}
          {view.review !== 'any' && <input type="hidden" name="review" value={view.review} />}
          <input
            type="search"
            name="q"
            defaultValue={view.query}
            placeholder={labels.filterPlaceholder}
            aria-label={labels.filterPlaceholder}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <button
            type="submit"
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {labels.filterApply}
          </button>
        </form>

        {isFiltered && (
          <Link
            href="/"
            className="shrink-0 text-xs text-slate-500 underline underline-offset-2 dark:text-slate-400"
          >
            {labels.clear}
          </Link>
        )}
      </div>
    </div>
  );
}
