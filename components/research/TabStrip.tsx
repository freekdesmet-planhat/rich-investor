import Link from 'next/link';

/**
 * A horizontal tab strip, for navigation within a page.
 *
 * Same active-pill treatment as the top-level nav, because the design notes
 * say a tab strip should mean the same thing wherever it appears. The
 * difference is that these tabs are links carrying query parameters rather
 * than routes, so the whole research view is addressable: a particular
 * statement at a particular periodicity is a URL somebody can bookmark or
 * send.
 *
 * Server-rendered links rather than client state, for the same reasons as
 * the primer's steps — it works with no JavaScript, and Back does what a
 * reader expects.
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
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
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
