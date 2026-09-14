/**
 * The locale vocabulary, with nothing server-only attached.
 *
 * `config.ts` reads the chosen locale out of the request, so it imports
 * `next/headers` and can only be loaded on the server. These few constants are
 * plain data, but living in that file meant anything importing them — the
 * number formatters, and through them any client component that formats a
 * value — pulled `next/headers` in behind them and failed to build.
 *
 * So the data lives here and `config.ts` re-exports it, leaving every existing
 * import working.
 */
export type Lang = 'en' | 'nl';

export const LOCALES: Lang[] = ['en', 'nl'];
export const DEFAULT_LOCALE: Lang = 'en';
export const LOCALE_COOKIE = 'rib-locale';

export const INTL_LOCALE: Record<Lang, string> = { en: 'en-US', nl: 'nl-NL' };

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'nl';
}
