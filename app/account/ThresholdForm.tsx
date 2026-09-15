'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveThresholds } from './thresholdActions';
import { SETTINGS_IDLE, type SettingsActionState } from '@/lib/settings/state';
import { EDITABLE_KEYS, defaultFieldsFor } from '@/lib/ratios/editableThresholds';

export interface ThresholdLabels {
  title: string;
  intro: string;
  bookNote: string;
  appliesNote: string;
  resetHint: string;
  save: string;
  saving: string;
  saved: string;
  error: string;
  /**
   * Resolved on the server, as maps rather than functions: a function cannot
   * cross into a client component, and passing one takes the whole page down.
   */
  names: Record<string, string>;
  fields: Record<string, string>;
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
    >
      {pending ? busy : idle}
    </button>
  );
}

/**
 * The five numbers the app chose for itself.
 *
 * Twenty cards said "app default" and implied a setting that did not exist.
 * These are the ones where that label was honest — the book states no cutoff
 * for EV/EBIT, P/FCF, revenue growth or leverage, so the app picked. The
 * book's own fourteen are not here and are not editable, which the form says
 * out loud rather than leaving the reader to notice.
 *
 * A blank field means "follow the app default", so clearing one is the reset.
 */
export function ThresholdForm({
  overrides,
  labels,
}: {
  overrides: Record<string, Record<string, number>>;
  labels: ThresholdLabels;
}) {
  const [state, action] = useActionState<SettingsActionState, FormData>(
    saveThresholds,
    SETTINGS_IDLE,
  );

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">{labels.title}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{labels.intro}</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{labels.bookNote}</p>

      <form action={action} className="mt-3 space-y-4">
        {EDITABLE_KEYS.map((key) => {
          const defaults = defaultFieldsFor(key);
          return (
            <fieldset key={key}>
              <legend className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {labels.names[key] ?? key}
              </legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {Object.entries(defaults).map(([field, fallback]) => (
                  <label key={field} className="block">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {labels.fields[field] ?? field}
                    </span>
                    <input
                      name={`${key}.${field}`}
                      inputMode="decimal"
                      defaultValue={overrides[key]?.[field] ?? ''}
                      placeholder={String(fallback)}
                      className="mt-1 block w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-950"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        <p className="text-xs text-slate-400 dark:text-slate-500">{labels.resetHint}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{labels.appliesNote}</p>

        <SubmitButton idle={labels.save} busy={labels.saving} />

        {state.status !== 'idle' && (
          <p
            role="status"
            aria-live="polite"
            className={`text-xs ${
              state.status === 'saved'
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {state.status === 'saved' ? labels.saved : labels.error}
          </p>
        )}
      </form>
    </section>
  );
}
