/**
 * What the watchlist looks like while it is being fetched.
 *
 * Every page here is server-rendered against live data and a stock page was
 * measured at about four seconds to first paint, during which the browser
 * showed the previous page and nothing at all indicated that anything was
 * happening — which reads as a tap that did not register, so you tap again.
 *
 * Shaped like the page it stands in for, so the layout does not jump when the
 * real rows arrive.
 */
import { StuckLoadingEscape } from '@/components/StuckLoadingEscape';

export default function WatchlistLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6" aria-busy="true">
      <span className="sr-only">Loading</span>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
          />
        ))}
      </div>

      <div className="mb-4 h-7 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />

      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-7 w-24 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800"
          />
        ))}
      </div>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex items-center justify-between gap-3 bg-white px-3 py-3 dark:bg-slate-900">
            <div className="min-w-0 flex-1">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              <div className="mt-2 h-3 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
          </li>
        ))}
      </ul>
      {/* A skeleton cannot time out on its own; this gives it one. */}
      <StuckLoadingEscape id="watchlist-stuck" />

    </main>
  );
}
