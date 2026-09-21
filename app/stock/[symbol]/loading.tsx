/**
 * What a stock page looks like while its figures are being fetched.
 *
 * This is the slow one — around four seconds, because it reads a signal, twenty
 * ratio rows, a snapshot, the reviews and the stored history before it can
 * render anything. Standing in for the real shape means the metric grid does
 * not appear to shove the header down when it arrives.
 */
import { StuckLoadingEscape } from '@/components/StuckLoadingEscape';

export default function StockLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6" aria-busy="true">
      <span className="sr-only">Loading</span>

      <div className="bg-surface-sunken h-4 w-36 animate-pulse rounded" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="bg-surface-sunken h-8 w-64 animate-pulse rounded" />
          <div className="bg-surface-sunken mt-2 h-4 w-48 animate-pulse rounded" />
        </div>
        <div className="bg-surface-sunken h-8 w-40 animate-pulse rounded-full" />
      </div>

      <div className="bg-surface-sunken mt-6 h-48 animate-pulse rounded-lg sm:h-56" />

      <ul className="border-line mt-8 divide-line divide-y overflow-hidden rounded-xl border">
        {Array.from({ length: 9 }, (_, i) => (
          <li key={i} className="bg-surface flex items-center justify-between gap-3 px-3 py-2">
            <div className="bg-surface-sunken h-4 w-56 animate-pulse rounded" />
            <div className="bg-surface-sunken h-3 w-24 animate-pulse rounded" />
          </li>
        ))}
      </ul>

      <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="bg-surface-sunken border-line h-28 animate-pulse rounded-lg border"
          />
        ))}
      </div>
      {/* A skeleton cannot time out on its own; this gives it one. */}
      <StuckLoadingEscape id="stock-stuck" />

    </main>
  );
}
