'use client';

import { useRouter } from 'next/navigation';

/**
 * Back to where you came from, not to the top of the watchlist.
 *
 * The control was a bare "←" with no accessible name, pointing at "/". Opening
 * the twenty-fourth row of twenty-seven and coming back landed you at row one,
 * with the scroll position and any filter you had typed both gone — so the way
 * to read down a list was to lose your place on every stock.
 *
 * `router.back()` returns through the history entry you arrived by, which
 * restores the scroll position and the filtered URL for free. The element stays
 * a real link to the watchlist, so it works without JavaScript and opens in a
 * new tab like any other link; the handler only intercepts the ordinary click.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();

  return (
    <a
      href={href}
      onClick={(event) => {
        // Let modified clicks and anything but the primary button behave as a
        // normal link: a middle-click should still open the watchlist.
        if (event.defaultPrevented) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (event.button !== 0) return;

        // Only when there is somewhere to go back to. Arriving from a bookmark
        // or a shared link has no history entry, and `back()` would leave the
        // app entirely.
        if (window.history.length <= 1) return;

        event.preventDefault();
        router.back();
      }}
      className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
    >
      <span aria-hidden="true">←</span>
      {label}
    </a>
  );
}
