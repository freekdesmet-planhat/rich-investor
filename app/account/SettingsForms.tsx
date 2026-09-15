'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveLanguage, saveNotifications, signOutEverywhere } from './settingsActions';
import { SETTINGS_IDLE, type SettingsActionState } from '@/lib/settings/state';
import type { MemberSettings } from '@/lib/data/queries';

export interface SettingsLabels {
  notifications: { title: string; intro: string; email: string; emailHint: string; enabled: string; onBuy: string; weekly: string };
  language: { title: string; intro: string; en: string; nl: string };
  security: { title: string; intro: string; signOutEverywhere: string; signingOut: string };
  save: string;
  saving: string;
  saved: string;
  errors: Record<string, string>;
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

function Status({ state, labels }: { state: SettingsActionState; labels: SettingsLabels }) {
  if (state.status === 'idle') return null;
  const text =
    state.status === 'saved'
      ? labels.saved
      : (labels.errors[state.message ?? ''] ?? labels.errors.unknown);

  return (
    <p
      role="status"
      aria-live="polite"
      className={`mt-2 text-xs ${
        state.status === 'saved'
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-rose-600 dark:text-rose-400'
      }`}
    >
      {text}
    </p>
  );
}

const CHECKBOX = 'flex items-center gap-2 text-sm';

/**
 * The settings the app has always had columns for and never had a form for.
 *
 * `settings` has carried a language, a notification address and three switches
 * since the sixth migration; the mailer reads them and falls back to an
 * environment variable when nobody has saved any. Nothing has ever been able to
 * write them, so the fallback was the only path. These are the forms.
 */
export function SettingsForms({
  settings,
  locale,
  labels,
}: {
  settings: MemberSettings;
  locale: string;
  labels: SettingsLabels;
}) {
  const [notifyState, notifyAction] = useActionState<SettingsActionState, FormData>(
    saveNotifications,
    SETTINGS_IDLE,
  );
  const [languageState, languageAction] = useActionState<SettingsActionState, FormData>(
    saveLanguage,
    SETTINGS_IDLE,
  );

  return (
    <>
      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {labels.notifications.title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {labels.notifications.intro}
        </p>

        <form action={notifyAction} className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {labels.notifications.email}
            </span>
            <input
              name="notify_email"
              type="email"
              defaultValue={settings.notify_email ?? ''}
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950"
            />
            <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
              {labels.notifications.emailHint}
            </span>
          </label>

          <label className={CHECKBOX}>
            <input type="checkbox" name="notify_enabled" defaultChecked={settings.notify_enabled} />
            <span>{labels.notifications.enabled}</span>
          </label>
          <label className={CHECKBOX}>
            <input type="checkbox" name="notify_on_buy" defaultChecked={settings.notify_on_buy} />
            <span>{labels.notifications.onBuy}</span>
          </label>
          <label className={CHECKBOX}>
            <input type="checkbox" name="weekly_summary" defaultChecked={settings.weekly_summary} />
            <span>{labels.notifications.weekly}</span>
          </label>

          <SubmitButton idle={labels.save} busy={labels.saving} />
          <Status state={notifyState} labels={labels} />
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {labels.language.title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{labels.language.intro}</p>

        <form action={languageAction} className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['en', 'nl'] as const).map((value) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name="language"
                  value={value}
                  defaultChecked={(settings.language ?? locale) === value}
                  className="peer sr-only"
                />
                <span className="inline-block rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:font-medium peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:peer-checked:border-slate-100 dark:peer-checked:bg-slate-100 dark:peer-checked:text-slate-900">
                  {labels.language[value]}
                </span>
              </label>
            ))}
          </div>

          <SubmitButton idle={labels.save} busy={labels.saving} />
          <Status state={languageState} labels={labels} />
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {labels.security.title}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{labels.security.intro}</p>

        <form action={signOutEverywhere} className="mt-3">
          <SubmitButton
            idle={labels.security.signOutEverywhere}
            busy={labels.security.signingOut}
          />
        </form>
      </section>
    </>
  );
}
