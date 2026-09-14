import { Sparkline } from './Sparkline';
import type { ConditionChange, Trend } from '@/lib/data/trend';

export interface ConditionTrendLabels {
  title: string;
  /** Carries {from}, {to} and {date}. */
  summary: string;
  /** Carries {count} and {date}; shown when the count held. */
  steady: string;
  /** Carries {date}. */
  changesSince: string;
  started: string;
  stopped: string;
  /** Shown when there is only one evaluation so far. */
  tooSoon: string;
  condition: (key: string) => string;
}

/**
 * The count over time, and which conditions moved it.
 *
 * A stock page is otherwise a snapshot: eight of nine today reads identically
 * whether it has been eight for a year or climbed from five last month, and the
 * climb is the thing the book tells you to act on. The named changes matter as
 * much as the count — "started passing: decline from the 5-year high" is a
 * different instruction from "started passing: net debt/EBITDA".
 */
export function ConditionTrend({
  trend,
  changes,
  labels,
}: {
  trend: Trend | null;
  /** Conditions that flipped between the reference evaluation and today. */
  changes: ConditionChange[];
  labels: ConditionTrendLabels;
}) {
  if (!trend) return null;

  const { reference, latest, delta } = trend;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">{labels.title}</h2>

      {!reference ? (
        // One evaluation is not a trend. Saying so is better than drawing a
        // flat line that implies nothing has changed.
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{labels.tooSoon}</p>
      ) : (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-end justify-between gap-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {delta === 0
                ? labels.steady
                    .replace('{count}', String(latest.conditions_met))
                    .replace('{date}', reference.as_of)
                : labels.summary
                    .replace('{from}', String(reference.conditions_met))
                    .replace('{to}', String(latest.conditions_met))
                    .replace('{date}', reference.as_of)}
            </p>
            <Sparkline
              points={trend.points.map((p) => ({ period: p.as_of, value: p.conditions_met }))}
              className="h-8 w-32 shrink-0"
            />
          </div>

          {changes.length > 0 && (
            <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {labels.changesSince.replace('{date}', reference.as_of)}
              </p>
              <ul className="mt-1 space-y-0.5">
                {changes.map((change) => (
                  <li
                    key={change.key}
                    className={`text-sm ${
                      change.gained
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-rose-700 dark:text-rose-300'
                    }`}
                  >
                    <span aria-hidden="true" className="mr-1">
                      {change.gained ? '+' : '−'}
                    </span>
                    {change.gained ? labels.started : labels.stopped} {labels.condition(change.key)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
