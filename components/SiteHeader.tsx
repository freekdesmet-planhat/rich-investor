import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import { MobileNav } from './nav/MobileNav';
import { NavLinks, type NavLink } from './nav/NavLinks';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/login/actions';

/**
 * The header.
 *
 * Three things were wrong with it, and only one of them was cosmetic.
 *
 * It had no active state: five identically styled links on every page, so the
 * bar could be used to leave a page but never to work out which one you were
 * on. Navigation that cannot orient you is doing half its job.
 *
 * It mixed navigation with account actions. Sign out sat in the same row, at
 * the same weight, as Watchlist and Search — one of those moves you around
 * the app and the other ends your session, and they looked the same.
 *
 * And it carried the tagline inside a sticky bar, which cost two lines of
 * vertical space on every page and every scroll position. The credit it
 * carried matters and has moved to the footer, which is already on every page
 * and is where a credit belongs; a proper methodology page comes with item 4.
 *
 * Now: brand, then navigation, then a separated account cluster. Under `lg`
 * the navigation collapses into a menu that actually behaves like one — see
 * MobileNav. `lg` rather than `md` because seven tabs need the room: at
 * tablet widths they wrapped, which quietly doubled the height of a sticky
 * header instead of overflowing where it would have been noticed.
 */
export async function SiteHeader() {
  const [t, tAuth, tNav, tTheme] = await Promise.all([
    getTranslations('app'),
    getTranslations('auth'),
    getTranslations('nav'),
    getTranslations('theme'),
  ]);
  const themeLabels = { toLight: tTheme('toLight'), toDark: tTheme('toDark') };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const links: NavLink[] = [
    { href: '/', label: tNav('watchlist') },
    { href: '/search', label: tNav('search') },
    { href: '/suggestions', label: tNav('suggestions') },
    { href: '/compare', label: tNav('compare') },
    { href: '/how-it-works', label: tNav('howItWorks') },
    { href: '/methodology', label: tNav('methodology') },
    ...(user ? [{ href: '/account', label: tNav('account') }] : []),
  ];

  const signOutButton = user?.email ? (
    <form action={signOut}>
      <button
        type="submit"
        title={tAuth('signedInAs', { email: user.email })}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-subtle transition hover:bg-surface-hover hover:text-ink"
      >
        {tAuth('signOut')}
      </button>
    </form>
  ) : null;

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        {/* min-w-0 lets the name truncate instead of forcing the bar wider. */}
        <Link
          href="/"
          className="min-w-0 shrink-0 truncate text-base font-semibold tracking-tight text-ink"
        >
          {t('name')}
        </Link>

        {/* The separator does the work the old layout asked whitespace to do:
            everything left of it moves you around, everything right of it is
            about your session. */}
        <div className="hidden min-w-0 flex-1 lg:block">
          <NavLinks links={links} />
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-1 border-l border-line pl-3 lg:flex">
          <ThemeToggle labels={themeLabels} />
          <LanguageSwitcher />
          {signOutButton}
        </div>

        <div className="ml-auto lg:hidden">
          <MobileNav links={links} label={tNav('menu')}>
            <ThemeToggle labels={themeLabels} />
            <LanguageSwitcher />
            {signOutButton}
          </MobileNav>
        </div>
      </div>
    </header>
  );
}
