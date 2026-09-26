'use client';

import { useEffect, useState } from 'react';
import { applyTheme } from '@/lib/themeClient';

/**
 * The quick light/dark switch in the header (round 2, item 3).
 *
 * A single flip between light and dark; the full System / Light / Dark choice
 * lives in Account. Reads the theme actually showing — including "system", via
 * the media query — so the icon and the action match what the reader sees. Moves
 * into the avatar menu in item 8.
 */
export function ThemeToggle({ labels, className = '' }: { labels: { toLight: string; toDark: string }; className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute('data-theme');
    const isDark =
      attr === 'dark' ||
      (attr == null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the mounted DOM/OS theme
    setDark(isDark);
  }, []);

  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    setDark(!dark);
  };

  // Render nothing until we know the current theme, to avoid a wrong-icon flash.
  const label = dark ? labels.toLight : labels.toDark;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`text-ink-subtle hover:text-ink hover:bg-surface-hover rounded-md p-1.5 transition ${className}`}
    >
      {dark ? (
        // Sun: switch to light.
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        </svg>
      ) : (
        // Moon: switch to dark. (Also shown before mount, defaulting to the light state.)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
