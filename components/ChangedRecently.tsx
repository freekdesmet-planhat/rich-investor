import Link from 'next/link';
import type { Trend } from '@/lib/data/trend';

export interface ChangedLabels {
  title: string;
  /** Carries {days}. */
  intro: string;
  /** Carries {count}. */
  gained: string;
  /** Carries {count}. */
  lost: string;
  /** Carries {from} and {to}, already translated status names. */
  moved: string;
  status: Record<string, string>;
}

/**
 * What moved on the watchlist, above the watchlist.
 *
 * The digest mails this once a day and then it is gone; the site itself never
 * said it. Anything that did not move is left out entirely — a section that
 * lists all twenty-seven rows again is the thing it is meant to save you from —
 * so on a quiet week it renders nothing at all.
 */
export function ChangedRecently({
  movers,
  days,
  labels,
}: {
  movers: Trend[];
  days: number;
  labels: ChangedLabels;
}) {
  if (movers.length === 0) return null;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/60">
      <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">{labels.title}</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
        {labels.intro.replace('{days}', String(days))}
      </p>

      <ul className="mt-2 space-y-1">
        {movers.map((trend) => {
          const up = trend.delta > 0;
          const count =
            trend.delta === 0
              ? null
              : (up ? labels.gained : labels.lost).replace('{count}', String(Math.abs(trend.delta)));

          const moved = trend.from
            ? labels.moved
                .replace('{from}', labels.status[trend.from] ?? trend.from)
                .replace('{to}', labels.status[trend.latest.status] ?? trend.latest.status)
            : null;

          return (
            <li key={trend.symbol} className="text-sm">
              <Link
                href={`/stock/${encodeURIComponent(trend.symbol)}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {trend.symbol}
              </Link>
              <span className="ml-2 text-slate-600 dark:text-slate-300">
                {/* Both facts when both happened: a name can gain two conditions
                    and cross into a new status on the same day, and either one
                    alone would understate it. */}
                {[moved, count].filter(Boolean).join(' · ')}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
