'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { LOCALE_COOKIE, isLang } from '@/lib/i18n/locale';
import type { SettingsActionState } from '@/lib/settings/state';

/** A year: long enough that a returning visit does not have to choose again. */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Where the daily digest goes, and whether it goes at all.
 *
 * The mailer has always read these columns, falling back to the NOTIFY_EMAILS
 * environment variable when nobody had saved any — so this row has been the
 * intended source since the beginning and there has never been a way to write
 * it. Saving an address here is what takes the deployment off that fallback.
 */
export async function saveNotifications(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { supabase, user } = await currentUser();
  if (!user) return { status: 'error', message: 'not_signed_in' };

  const email = String(formData.get('notify_email') ?? '').trim().toLowerCase();
  if (email !== '' && !email.includes('@')) return { status: 'error', message: 'email' };

  const { error } = await supabase.from('settings').upsert(
    {
      user_id: user.id,
      notify_email: email === '' ? null : email,
      notify_enabled: formData.get('notify_enabled') === 'on',
      notify_on_buy: formData.get('notify_on_buy') === 'on',
      weekly_summary: formData.get('weekly_summary') === 'on',
    },
    { onConflict: 'user_id' },
  );
  if (error) return { status: 'error', message: error.message };

  revalidatePath('/account');
  return { status: 'saved' };
}

/**
 * The language, saved to the account as well as to this browser.
 *
 * The cookie is what every page reads, so it is written here too — a request
 * cannot afford a database round trip just to pick a language. The stored row
 * is what the daily digest reads, so this is also the setting that decides
 * which language the email arrives in; and it is what a new browser would be
 * told to use, once anything asks.
 */
export async function saveLanguage(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const { supabase, user } = await currentUser();
  if (!user) return { status: 'error', message: 'not_signed_in' };

  const language = String(formData.get('language') ?? '');
  if (!isLang(language)) return { status: 'error', message: 'language' };

  const { error } = await supabase
    .from('settings')
    .upsert({ user_id: user.id, language }, { onConflict: 'user_id' });
  if (error) return { status: 'error', message: error.message };

  const store = await cookies();
  store.set(LOCALE_COOKIE, language, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  });

  revalidatePath('/', 'layout');
  return { status: 'saved' };
}

/**
 * Signs every session out, everywhere.
 *
 * `scope: 'global'` revokes the refresh tokens rather than only clearing this
 * browser's cookie, which is the point: it is the thing to reach for when a
 * device is lost, and clearing one cookie would not touch it.
 */
export async function signOutEverywhere(): Promise<void> {
  const { supabase, user } = await currentUser();
  if (!user) return;

  await supabase.auth.signOut({ scope: 'global' });
  revalidatePath('/', 'layout');
}
