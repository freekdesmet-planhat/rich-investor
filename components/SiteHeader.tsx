import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from './LanguageSwitcher';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/login/actions';

/**
 * The header, at two sizes.
 *
 * Everything on the right — three or four nav links, two language buttons and
 * sign out — was marked `shrink-0`, so the block could not give way and the
 * header needed more width than a phone has before it could lay out at all.
 * Under `sm` those controls move into a disclosure behind a menu button, and
 * the bar itself carries only the title and that button.
 *
 * The disclosure is a native `<details>`, so it opens and closes with no client
 * JavaScript and works in a server component — the rest of this header is
 * server-rendered and there is no reason for a menu to change that.
 */
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

  const links = [
    { href: '/', label: tNav('watchlist') },
    { href: '/search', label: tNav('search') },
    { href: '/suggestions', label: tNav('suggestions') },
    ...(user ? [{ href: '/account', label: tNav('account') }] : []),
  ];

  const linkClass =
    'rounded px-2 py-1 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto max-w-5xl px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* min-w-0 lets the title truncate instead of forcing the bar wider. */}
          <Link href="/" className="min-w-0">
            <span className="block truncate text-base font-semibold">{t('name')}</span>
            <span className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
              {t('tagline')}
            </span>
          </Link>

          {/* --- phone: one button, everything behind it ------------------- */}
          <details className="group relative shrink-0 sm:hidden">
            <summary
              className="flex cursor-pointer list-none items-center rounded px-2 py-1 text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={tNav('menu')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3 5.5h14M3 10h14M3 14.5h14" />
              </svg>
            </summary>

            <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <nav className="flex flex-col text-sm">
                {links.map((link) => (
                  <Link key={link.href} href={link.href} className={linkClass}>
                    {link.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-slate-700">
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
          </details>

          {/* --- sm and up: the same controls, laid out inline ------------- */}
          <div className="hidden items-center gap-2 sm:flex">
            <nav className="flex items-center gap-1 text-xs">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              ))}
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
      </div>
    </header>
  );
}
