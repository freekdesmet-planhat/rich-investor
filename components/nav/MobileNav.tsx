'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { NavLinks, type NavLink } from './NavLinks';

/**
 * The phone menu.
 *
 * Still a `<details>` underneath, which is what let the previous version work
 * in a server component with no JavaScript, and that property is worth
 * keeping. What it did not do was behave like a menu once JavaScript *was*
 * there: it stayed open after you followed a link, so arriving on the new
 * page meant finding the panel still covering it; it ignored Escape; and a
 * click anywhere else on the page left it hanging open.
 *
 * So the element stays, and the behaviour is added around it. With no
 * JavaScript this is exactly the old disclosure. With it, the menu closes on
 * navigation, on Escape, and on a click outside — which is all anyone means
 * by "the menu works".
 */
export function MobileNav({
  links,
  label,
  children,
}: {
  links: NavLink[];
  /** Accessible name for the button. */
  label: string;
  /** The account cluster, below a divider: language, sign out. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  /**
   * Closing on navigation covers the links inside *and* anything that routes
   * from the account cluster below them.
   *
   * Adjusted during render rather than in an effect: React's own guidance for
   * state that derives from a change, and it avoids the extra commit an
   * effect would cause — the menu would otherwise paint open for a frame on
   * the page you just navigated to.
   */
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <details
      ref={ref}
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      className="relative shrink-0 lg:hidden"
    >
      <summary
        aria-label={label}
        className="flex cursor-pointer list-none items-center rounded-lg p-2 text-ink-muted transition hover:bg-surface-hover"
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
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 5.5h14M3 10h14M3 14.5h14" />}
        </svg>
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-raised">
        <NavLinks links={links} orientation="column" onNavigate={() => setOpen(false)} />
        {children && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
            {children}
          </div>
        )}
      </div>
    </details>
  );
}
