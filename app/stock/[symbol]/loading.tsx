/**
 * What a stock page looks like while its figures are being fetched.
 *
 * This is the slow one — around four seconds, because it reads a signal, twenty
 * ratio rows, a snapshot, the reviews and the stored history before it can
 * render anything. Standing in for the real shape means the metric grid does
 * not appear to shove the header down when it arrives.
 */
export default function StockLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6" aria-busy="true">
      <span className="sr-only">Loading</span>

      <div className="h-4 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="h-8 w-64 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="h-8 w-40 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
      </div>

      <div className="mt-6 h-48 animate-pulse rounded-lg bg-slate-100 sm:h-56 dark:bg-slate-800" />

      <ul className="mt-8 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {Array.from({ length: 9 }, (_, i) => (
          <li key={i} className="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-slate-900">
            <div className="h-4 w-56 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </li>
        ))}
      </ul>

      <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
          />
        ))}
      </div>
    </main>
  );
}
