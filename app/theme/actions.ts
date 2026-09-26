'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { THEME_COOKIE, isTheme, type Theme } from '@/lib/theme';

/**
 * Persists a theme choice (round 2, item 3).
 *
 * Sets the cookie so SSR paints the right theme with no flash, and — when signed
 * in — saves it to the member's settings so it follows them. The client applies
 * the theme to the DOM and localStorage itself for instant feedback; this makes
 * it durable.
 */
export async function saveTheme(theme: Theme): Promise<void> {
  if (!isTheme(theme)) return;

  const jar = await cookies();
  jar.set(THEME_COOKIE, theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from('settings').update({ theme }).eq('user_id', user.id);
}
