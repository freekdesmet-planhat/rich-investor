'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveThresholds } from './thresholdActions';
import { SETTINGS_IDLE, type SettingsActionState } from '@/lib/settings/state';
import { EDITABLE_KEYS, defaultFieldsFor } from '@/lib/ratios/editableThresholds';
import { SectionHeading } from '@/components/ui/Surface';

export interface ThresholdLabels {
  title: string;
  intro: string;
  bookNote: string;
  appliesNote: string;
  markNote: string;
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
      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-60"
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
      <SectionHeading>{labels.title}</SectionHeading>
      <p className="text-ink-subtle mt-1 text-sm">{labels.intro}</p>
      <p className="text-ink-subtle mt-1 text-sm">{labels.bookNote}</p>

      <form action={action} className="mt-3 space-y-4">
        {EDITABLE_KEYS.map((key) => {
          const defaults = defaultFieldsFor(key);
          return (
            <fieldset key={key}>
              <legend className="text-ink-muted text-xs font-medium">
                {labels.names[key] ?? key}
              </legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {Object.entries(defaults).map(([field, fallback]) => {
                  // Revenue growth is higher-is-better, so its green/orange bands
                  // read "at or above", not the default "at or below" (audit A3).
                  const labelKey =
                    key === 'revenueGrowth' && (field === 'green' || field === 'orange')
                      ? `${field}Up`
                      : field;
                  return (
                  <label key={field} className="block">
                    <span className="text-ink-subtle text-xs">
                      {labels.fields[labelKey] ?? labels.fields[field] ?? field}
                    </span>
                    <input
                      name={`${key}.${field}`}
                      inputMode="decimal"
                      defaultValue={overrides[key]?.[field] ?? ''}
                      placeholder={String(fallback)}
                      className="border-line-strong mt-1 block w-24 rounded-lg border bg-surface px-2 py-1.5 text-sm tabular-nums"
                    />
                  </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <p className="text-ink-faint text-xs">{labels.resetHint}</p>
        <p className="text-ink-faint text-xs">{labels.appliesNote}</p>
        <p className="text-ink-faint text-xs">{labels.markNote}</p>

        <SubmitButton idle={labels.save} busy={labels.saving} />

        {state.status !== 'idle' && (
          <p
            role="status"
            aria-live="polite"
            className={`text-xs ${
              state.status === 'saved'
                ? 'text-pass'
                : 'text-fail'
            }`}
          >
            {state.status === 'saved' ? labels.saved : labels.error}
          </p>
        )}
      </form>
    </section>
  );
}
