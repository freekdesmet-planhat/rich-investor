'use client';

import { useEffect, useState } from 'react';
import { applyTheme } from '@/lib/themeClient';
import { THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

/**
 * The System / Light / Dark choice on the Account page (round 2, item 3).
 *
 * Applies the theme to the DOM, localStorage and cookie immediately, and saves it
 * to the member's settings. "System" removes the attribute so the OS decides.
 */
export function ThemePicker({
  initial,
  labels,
}: {
  initial: Theme;
  labels: { system: string; light: string; dark: string; legend: string };
}) {
  const [theme, setTheme] = useState<Theme>(initial);

  // Reflect a logged-out localStorage choice if it differs from the saved one.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflect a stored logged-out choice on mount
      if (stored === 'system' || stored === 'light' || stored === 'dark') setTheme(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  const options: Theme[] = ['system', 'light', 'dark'];
  return (
    <fieldset>
      <legend className="sr-only">{labels.legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={theme === value}
            onClick={() => choose(value)}
            className={
              theme === value
                ? 'border-accent bg-accent text-accent-ink rounded-full border px-3 py-1.5 text-sm font-medium'
                : 'border-line-strong text-ink-muted hover:bg-surface-hover rounded-full border px-3 py-1.5 text-sm transition'
            }
          >
            {labels[value]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
