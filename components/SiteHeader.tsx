import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from './LanguageSwitcher';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/login/actions';

export async function SiteHeader() {
  const [t, tAuth, tNav] = await Promise.all([
    getTranslations('app'),
    getTranslations('auth'),
    getTranslations('nav'),
  ]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="min-w-0">
          <span className="block truncate text-base font-semibold">{t('name')}</span>
          <span className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
            {t('tagline')}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <nav className="flex items-center gap-1 text-xs">
            <Link
              href="/"
              className="rounded px-2 py-1 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {tNav('watchlist')}
            </Link>
            <Link
              href="/suggestions"
              className="rounded px-2 py-1 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {tNav('suggestions')}
            </Link>
          </nav>
          <LanguageSwitcher />
          {user?.email && (
            <form action={signOut}>
              <button
                type="submit"
                title={tAuth('signedInAs', { email: user.email })}
                className="rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {tAuth('signOut')}
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
