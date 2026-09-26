'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * A horizontal tab strip, for navigation within a page.
 *
 * Same active-pill treatment as the top-level nav, because the design notes
 * say a tab strip should mean the same thing wherever it appears. The tabs are
 * links carrying query parameters rather than routes, so the whole research view
 * stays addressable: a particular statement at a particular periodicity is a URL
 * somebody can bookmark or send.
 *
 * Switching a tab uses router.replace, not a push (round 2, item 1): clicking
 * through several tabs used to stack a history entry each, so "Back to the
 * analysis" walked back through every tab instead of returning to the stock page.
 * With replace, each switch overwrites the last, and Back leaves research in one
 * step. Rendered as real links so it still works, and stays addressable, with no
 * JavaScript — the click handler only upgrades the behaviour when JS is present.
 */
export function TabStrip({
  tabs,
  size = 'normal',
  label,
}: {
  tabs: Array<{ href: string; label: string; active: boolean }>;
  size?: 'normal' | 'small';
  label: string;
}) {
  const router = useRouter();
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          onClick={(event) => {
            // Plain left-click only: let modified clicks (new tab) and the no-JS
            // path fall through to the normal link.
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            router.replace(tab.href, { scroll: false });
          }}
          className={[
            'whitespace-nowrap rounded-lg transition',
            size === 'small' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            tab.active
              ? 'bg-surface-sunken font-semibold text-ink'
              : 'font-medium text-ink-subtle hover:bg-surface-hover hover:text-ink',
          ].join(' ')}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
