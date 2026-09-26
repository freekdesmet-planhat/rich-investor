/**
 * Theme preference, shared by server and client (round 2, item 3).
 *
 * The `data-theme` attribute on <html> drives the CSS (globals.css): absent means
 * "follow the system", "light"/"dark" force a theme. The choice is kept in a
 * cookie so SSR can set the attribute with no flash, mirrored to localStorage for
 * logged-out pages, and saved per user when signed in. New users default to light.
 */
export type Theme = 'system' | 'light' | 'dark';

export const THEME_COOKIE = 'rib-theme';
export const THEME_STORAGE_KEY = 'theme';
// No saved preference means "follow the OS" (round 2, item 7 review): a first
// visit with the OS in dark mode paints dark, and light paints light, with no
// flash — the CSS media query decides at first paint, before any JS. A reader
// only leaves this "system" default by choosing a theme in the header or Account.
export const DEFAULT_THEME: Theme = 'system';

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** The `data-theme` attribute value, or undefined for "system" (no attribute). */
export function dataTheme(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}
