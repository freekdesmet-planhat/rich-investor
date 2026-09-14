import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SignInForm } from './SignInForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const [t, tAuth] = await Promise.all([getTranslations('app'), getTranslations('auth')]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('name')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('tagline')}</p>
        </div>
        <LanguageSwitcher />
      </div>

      <SignInForm
        labels={{
          email: tAuth('email'),
          password: tAuth('password'),
          passwordHint: tAuth('passwordHint'),
          signIn: tAuth('signIn'),
          signingIn: tAuth('signingIn'),
          orLink: tAuth('sendLink'),
          sendingLink: tAuth('sending'),
          linkSent: tAuth('linkSent'),
          hint: tAuth('whitelistHint'),
          errors: {
            invalid_email: tAuth('invalidEmail'),
            invalid_credentials: tAuth('invalidCredentials'),
            password_required: tAuth('passwordRequired'),
            send_failed: tAuth('error'),
            generic: tAuth('error'),
          },
        }}
      />
    </main>
  );
}
