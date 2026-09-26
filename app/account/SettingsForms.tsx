'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveLanguage, saveNotifications, signOutEverywhere } from './settingsActions';
import { SETTINGS_IDLE, type SettingsActionState } from '@/lib/settings/state';
import type { MemberSettings } from '@/lib/data/queries';
import { SectionHeading } from '@/components/ui/Surface';

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
      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-60"
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
          ? 'text-pass'
          : 'text-fail'
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
        <SectionHeading>{labels.notifications.title}</SectionHeading>
        <p className="text-ink-subtle mt-1 text-sm">
          {labels.notifications.intro}
        </p>

        <form action={notifyAction} className="mt-3 space-y-3">
          <label className="block">
            <span className="text-ink-subtle text-xs">
              {labels.notifications.email}
            </span>
            <input
              name="notify_email"
              type="email"
              defaultValue={settings.notify_email ?? ''}
              placeholder="you@example.com"
              className="border-line-strong mt-1 block w-full rounded-lg border bg-surface px-3 py-2 text-sm"
            />
            <span className="text-ink-faint mt-1 block text-xs">
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
        <SectionHeading>{labels.language.title}</SectionHeading>
        <p className="text-ink-subtle mt-1 text-sm">{labels.language.intro}</p>

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
                <span className="border-line-strong text-ink-muted hover:bg-surface-hover inline-block rounded-full border px-3 py-2 text-sm transition peer-checked:border-accent peer-checked:bg-accent peer-checked:font-medium peer-checked:text-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
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
        <SectionHeading>{labels.security.title}</SectionHeading>
        <p className="text-ink-subtle mt-1 text-sm">{labels.security.intro}</p>

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
