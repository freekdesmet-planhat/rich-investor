import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { createClient } from '@/lib/supabase/server';
import { PasswordForm } from './PasswordForm';

export const dynamic = 'force-dynamic';

/**
 * Where a member sets their own password.
 *
 * An account created through a magic link has none, so password sign-in would
 * be unusable without this. The form acts on the session, so it can only ever
 * change the caller's own password.
 */
export default async function AccountPage() {
  const [tAuth, tAccount] = await Promise.all([
    getTranslations('auth'),
    getTranslations('account'),
  ]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-sm px-4 py-6">
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
      </main>
    </>
  );
}
