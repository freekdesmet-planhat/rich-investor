'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isLang, LOCALE_COOKIE } from '@/lib/i18n/config';

/**
 * Persists the language choice.
 *
 * Written to a cookie today; once magic-link sign-in exists this also writes
 * `settings.language`, so the preference follows the user rather than the
 * browser (section 2).
 */
export async function setLocale(formData: FormData): Promise<void> {
  const value = formData.get('locale');
  if (!isLang(value)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  revalidatePath('/', 'layout');
}
