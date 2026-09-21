import { Sparkline } from './Sparkline';
import type { Trend } from '@/lib/data/trend';

export interface TrendLabels {
  /** Carries {count} and {date}; describes a gain. */
  gained: string;
  /** Carries {count} and {date}; describes a loss. */
  lost: string;
  steady: string;
  /** Screen-reader description of the line, carries {from}, {to}, {date}. */
  chart: string;
}

/**
 * How a ticker has moved, in the space the nine-segment meter used to fill.
 *
 * That meter drew one bar per condition beside a line that already read "7 of 9
 * conditions met" — the same fact twice, and it could not be clicked, hovered
 * or explained. What the number genuinely cannot say is the direction: 7 of 9
 * on the way up is the moment to look, and 7 of 9 on the way down is the moment
 * to stop waiting. This says that instead.
 */
export function TrendCell({ trend, labels }: { trend: Trend | null; labels: TrendLabels }) {
  if (!trend || !trend.reference) return null;

  const { delta, reference, latest } = trend;
  const since = reference.as_of;

  const badge =
    delta === 0
      ? null
      : (delta > 0 ? labels.gained : labels.lost)
          .replace('{count}', String(Math.abs(delta)))
          .replace('{date}', since);

  return (
    <span className="hidden items-center gap-2 sm:flex">
      {/* Rising is unambiguously good here — these are conditions passed — so
          colouring the line by its direction means the same thing as colouring
          it by outcome. That is not true of every ratio, which is why the card
          sparklines do not do this. */}
      <Sparkline
        points={trend.points.map((p) => ({ period: p.as_of, value: p.conditions_met }))}
        className="h-5 w-16"
      />
      <span className="sr-only">
        {labels.chart
          .replace('{from}', String(reference.conditions_met))
          .replace('{to}', String(latest.conditions_met))
          .replace('{date}', since)}
      </span>
      {badge && (
        <span
          className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs tabular-nums ${
            delta > 0
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'bg-surface-sunken text-ink-muted'
          }`}
        >
          {delta > 0 ? '▲' : '▼'} {badge}
        </span>
      )}
    </span>
  );
}
