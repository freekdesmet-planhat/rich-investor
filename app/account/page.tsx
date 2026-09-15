import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { createClient } from '@/lib/supabase/server';
import { PasswordForm } from './PasswordForm';
import { SettingsForms } from './SettingsForms';
import { ThresholdForm } from './ThresholdForm';
import { getThresholdOverrides } from '@/lib/data/queries';
import { EDITABLE_KEYS, defaultFieldsFor } from '@/lib/ratios/editableThresholds';
import { getSettings } from '@/lib/data/queries';
import { getLocale } from 'next-intl/server';

export const dynamic = 'force-dynamic';

/**
 * Where a member sets their own password.
 *
 * An account created through a magic link has none, so password sign-in would
 * be unusable without this. The form acts on the session, so it can only ever
 * change the caller's own password.
 */
export default async function AccountPage() {
  const [tAuth, tAccount, settings, locale, thresholds] = await Promise.all([
    getTranslations('auth'),
    getTranslations('account'),
    getSettings(),
    getLocale(),
    getThresholdOverrides(),
  ]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-lg px-4 py-6">
        <h1 className="text-xl font-semibold">{tAccount('title')}</h1>
        {user?.email && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {tAuth('signedInAs', { email: user.email })}
          </p>
        )}

        <section className="mt-6">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {tAccount('passwordTitle')}
          </h2>
          <p className="mb-3 mt-1 text-xs text-slate-500 dark:text-slate-400">
            {tAccount('passwordIntro')}
          </p>

          <PasswordForm
            labels={{
              newPassword: tAccount('newPassword'),
              confirm: tAccount('confirmPassword'),
              save: tAccount('save'),
              saving: tAccount('saving'),
              saved: tAccount('saved'),
              errors: {
                too_short: tAccount('tooShort'),
                mismatch: tAccount('mismatch'),
                not_signed_in: tAuth('signInFailed'),
                save_failed: tAuth('error'),
                generic: tAuth('error'),
              },
            }}
          />
        </section>

        <SettingsForms
          settings={settings}
          locale={locale}
          labels={{
            notifications: {
              title: tAccount('notifications.title'),
              intro: tAccount('notifications.intro'),
              email: tAccount('notifications.email'),
              emailHint: tAccount('notifications.emailHint'),
              enabled: tAccount('notifications.enabled'),
              onBuy: tAccount('notifications.onBuy'),
              weekly: tAccount('notifications.weekly'),
            },
            language: {
              title: tAccount('language.title'),
              intro: tAccount('language.intro'),
              en: tAccount('language.en'),
              nl: tAccount('language.nl'),
            },
            security: {
              title: tAccount('security.title'),
              intro: tAccount('security.intro'),
              signOutEverywhere: tAccount('security.signOutEverywhere'),
              signingOut: tAccount('security.signingOut'),
            },
            save: tAccount('saveSettings'),
            saving: tAccount('savingSettings'),
            saved: tAccount('savedSettings'),
            errors: {
              email: tAccount('errors.email'),
              language: tAccount('errors.language'),
              not_signed_in: tAuth('signInFailed'),
              unknown: tAuth('error'),
            },
          }}
        />

        <ThresholdForm
          overrides={thresholds}
          labels={{
            title: tAccount('thresholds.title'),
            intro: tAccount('thresholds.intro'),
            bookNote: tAccount('thresholds.bookNote'),
            appliesNote: tAccount('thresholds.appliesNote'),
            resetHint: tAccount('thresholds.resetHint'),
            save: tAccount('saveSettings'),
            saving: tAccount('savingSettings'),
            saved: tAccount('thresholds.saved'),
            error: tAccount('thresholds.error'),
            names: Object.fromEntries(
              EDITABLE_KEYS.map((key) => [key, tAccount(`thresholds.names.${key}`)]),
            ),
            fields: Object.fromEntries(
              [...new Set(EDITABLE_KEYS.flatMap((key) => Object.keys(defaultFieldsFor(key))))].map(
                (field) => [field, tAccount(`thresholds.fields.${field}`)],
              ),
            ),
          }}
        />

        {/* --- your data, back out again ------------------------------------ */}
        <section className="mt-8">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {tAccount('export.title')}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {tAccount('export.intro')}
          </p>
          <a
            href="/api/export"
            download
            className="mt-3 inline-block rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {tAccount('export.download')}
          </a>
        </section>
      </main>
    </>
  );
}
