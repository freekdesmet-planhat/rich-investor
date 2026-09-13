/**
 * Locale configuration.
 *
 * There is one user, so the locale is a preference rather than part of the URL:
 * it is read from a cookie, written from the `settings` table on sign-in, and
 * falls back to the browser's Accept-Language on a first visit (section 2).
 */
import { cookies, headers } from 'next/headers';

export type Lang = 'en' | 'nl';

export const LOCALES: Lang[] = ['en', 'nl'];
export const DEFAULT_LOCALE: Lang = 'en';
export const LOCALE_COOKIE = 'rib-locale';

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'nl';
}

/** Picks the best supported locale out of an Accept-Language header. */
export function localeFromAcceptLanguage(header: string | null): Lang | null {
  if (!header) return null;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((entry) => Number.isFinite(entry.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLang(base)) return base;
  }
  return null;
}

/** The locale for the current request: cookie, then browser, then default. */
export async function resolveLocale(): Promise<Lang> {
  const cookieStore = await cookies();
  const stored = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLang(stored)) return stored;

  const headerStore = await headers();
  return localeFromAcceptLanguage(headerStore.get('accept-language')) ?? DEFAULT_LOCALE;
}

/** Intl locale tag used for number, currency and date formatting. */
export const INTL_LOCALE: Record<Lang, string> = { en: 'en-US', nl: 'nl-NL' };
