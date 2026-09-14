import type { HistoryChange } from '@/lib/review/history';
import type { Translation } from '@/lib/data/queries';

export interface HistoryLabels {
  title: string;
  intro: string;
  first: string;
  changed: string;
  unchanged: string;
  added: string;
  removed: string;
  marks: string;
  assessment: Record<string, string>;
}

const TONE: Record<string, string> = {
  temporary: 'text-emerald-700 dark:text-emerald-300',
  structural: 'text-rose-700 dark:text-rose-300',
  not_assessed: 'text-slate-500 dark:text-slate-400',
};

/**
 * What you used to think.
 *
 * Not a list of saves — a list of changes. A save that moved nothing says so in
 * one line, and the entry where the verdict turned is the one that reads
 * loudest, because that is the entry you came looking for.
 */
export function HistoryLog({
  changes,
  docs,
  labels,
}: {
  changes: HistoryChange[];
  docs: Map<string, Translation>;
  labels: HistoryLabels;
}) {
  const label = (namespace: string, key: string) => docs.get(`${namespace}:${key}`)?.name ?? key;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">{labels.title}</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{labels.intro}</p>

      <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-800">
        {changes.map((change) => {
          const verdict = labels.assessment[change.entry.assessment] ?? change.entry.assessment;

          return (
            <li key={change.entry.id} className="text-sm">
              <p className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {change.entry.saved_at.slice(0, 10)}
              </p>

              <p className="mt-0.5">
                {change.isFirst && (
                  <span className="text-slate-600 dark:text-slate-300">{`${labels.first}: `}</span>
                )}
                {change.changedFrom ? (
                  <span className={TONE[change.entry.assessment]}>
                    {labels.changed
                      .replace('{from}', labels.assessment[change.changedFrom] ?? change.changedFrom)
                      .replace('{to}', verdict)}
                  </span>
                ) : change.unchanged ? (
                  <span className="text-slate-400 dark:text-slate-500">{labels.unchanged}</span>
                ) : (
                  <span className={TONE[change.entry.assessment]}>{verdict}</span>
                )}
              </p>

              {/* Only the movement, not the whole state: repeating every tick on
                  every entry would bury the one that changed. */}
              <Movement
                prefix={labels.added}
                items={[
                  ...change.addedCatalysts.map((k) => label('catalyst', k)),
                  ...change.addedSellSignals.map((k) => label('sell_signal', k)),
                ]}
                tone="text-emerald-700 dark:text-emerald-300"
              />
              <Movement
                prefix={labels.removed}
                items={[
                  ...change.removedCatalysts.map((k) => label('catalyst', k)),
                  ...change.removedSellSignals.map((k) => label('sell_signal', k)),
                ]}
                tone="text-slate-500 dark:text-slate-400"
              />

              {change.marksChanged && !change.isFirst && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{labels.marks}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Movement({ prefix, items, tone }: { prefix: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <p className={`mt-0.5 text-xs ${tone}`}>
      {prefix} {items.join(', ')}
    </p>
  );
}
