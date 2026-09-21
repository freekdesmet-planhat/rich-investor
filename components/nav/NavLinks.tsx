'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLink {
  href: string;
  label: string;
}

/**
 * The primary navigation, and the only thing that knows which page you are on.
 *
 * The header had no active state at all: five links, identically styled, on
 * every page. Nothing told you where you were, so the nav could only be used
 * to leave — never to orient. That is most of what "clunky navigation" means
 * in practice, and it is the cheapest of the problems to fix.
 *
 * A client component purely because `usePathname` is. The rest of the header
 * stays server-rendered, and the links themselves are ordinary `<Link>`s, so
 * this degrades to plain navigation with no JavaScript — it just loses the
 * highlight.
 */
export function NavLinks({
  links,
  orientation = 'row',
  onNavigate,
}: {
  links: NavLink[];
  orientation?: 'row' | 'column';
  /** Lets the mobile sheet close itself when a link is followed. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  /**
   * `/` only matches itself.
   *
   * A prefix match would light the watchlist up on every page in the app,
   * which is worse than no highlight: a wrong answer read as a right one.
   * Everything else matches its own subtree, so `/stock/ASML` is not claimed
   * by any tab — you did not navigate to it from the bar, and pretending
   * otherwise would be the same lie in miniature.
   */
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Primary"
      className={
        orientation === 'row'
          ? 'flex items-center gap-1'
          : 'flex flex-col gap-0.5'
      }
    >
      {links.map((link) => {
        const active = isActive(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            // Announced as well as shown. The highlight is colour and weight,
            // which a screen reader cannot see and a colour-blind reader may
            // not distinguish.
            aria-current={active ? 'page' : undefined}
            className={[
              'rounded-lg px-3 py-1.5 text-sm transition',
              orientation === 'column' ? 'w-full' : '',
              active
                ? 'bg-surface-sunken font-semibold text-ink'
                : 'font-medium text-ink-subtle hover:bg-surface-hover hover:text-ink',
            ].join(' ')}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
