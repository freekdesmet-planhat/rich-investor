import { saveTheme } from '@/app/theme/actions';
import { THEME_STORAGE_KEY, THEME_COOKIE, type Theme } from '@/lib/theme';

/**
 * Applies a theme on the client: the DOM attribute for an instant switch, then
 * localStorage, the cookie (so SSR agrees next load) and the server (round 2,
 * item 3). Module scope, so the DOM writes stay out of component bodies.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode: the cookie still carries it */
  }
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;samesite=lax`;
  void saveTheme(theme);
}
