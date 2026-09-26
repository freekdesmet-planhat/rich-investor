import Link from 'next/link';
import type { Trend } from '@/lib/data/trend';

export interface ChangedLabels {
  title: string;
  /** One line: carries {closer} and {further}. */
  summary: string;
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

  const closer = movers.filter((m) => m.delta > 0).length;
  const further = movers.filter((m) => m.delta < 0).length;

  // One line by default (launch item 9): "This week: 5 moved closer, 6 further",
  // with the per-name detail behind the expander for when it is wanted.
  return (
    <details className="border-line group mb-4 rounded-xl border bg-surface-sunken p-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 text-sm marker:content-none">
        <span className="font-medium text-ink">{labels.title}</span>
        <span className="text-ink-subtle">
          {labels.summary.replace('{closer}', String(closer)).replace('{further}', String(further))}
        </span>
      </summary>
      <p className="text-ink-subtle mt-2 text-xs">
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
              <span className="text-ink-muted ml-2">
                {/* Both facts when both happened: a name can gain two conditions
                    and cross into a new status on the same day, and either one
                    alone would understate it. */}
                {[moved, count].filter(Boolean).join(' · ')}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
