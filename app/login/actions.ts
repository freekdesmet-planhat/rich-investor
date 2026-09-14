'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isEmailAllowed } from '@/lib/auth/allowlist';
import { safeReturnTo } from '@/lib/auth/returnTo';

export interface SignInState {
  status: 'idle' | 'sent' | 'error';
  /** A message key the form maps to localised copy — never raw provider text. */
  message?: string;
}

/** Where the magic link should land. */
async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const headerStore = await headers();
  return `${headerStore.get('x-forwarded-proto') ?? 'http'}://${headerStore.get('host')}`;
}

/**
 * Handles both ways in: a password, or a magic link.
 *
 * Which one is decided by the button pressed, so the two paths share one form
 * and one whitelist check rather than drifting apart.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const intent = String(formData.get('intent') ?? 'magiclink');
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  // Where the middleware interrupted them. Validated, because it comes from a
  // querystring and would otherwise be an open redirect.
  const next = safeReturnTo(String(formData.get('next') ?? ''));

  if (!email.includes('@')) return { status: 'error', message: 'invalid_email' };

  const allowed = await isEmailAllowed(email);
  const supabase = await createClient();

  if (intent === 'password') {
    if (!password) return { status: 'error', message: 'password_required' };

    // An unapproved address must fail exactly like a wrong password, so this
    // form cannot be used to work out who has access.
    if (!allowed) return { status: 'error', message: 'invalid_credentials' };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // The provider's own message distinguishes "no such user" from "wrong
    // password"; ours deliberately does not.
    if (error) return { status: 'error', message: 'invalid_credentials' };

    redirect(next);
  }

  // --- magic link ----------------------------------------------------------
  //
  // `shouldCreateUser` stays on: neither member has an auth user before their
  // first sign-in, and the whitelist is what gates account creation.
  //
  // The response is identical whether or not the address is approved, for the
  // same reason as above.
  if (!allowed) return { status: 'sent' };

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { status: 'error', message: 'send_failed' };
  return { status: 'sent' };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export interface PasswordState {
  status: 'idle' | 'saved' | 'error';
  message?: string;
}

/**
 * Sets or changes the signed-in member's password.
 *
 * Needed because an account created through a magic link has no password at
 * all, so password sign-in would be unusable without somewhere to set one.
 * Only ever acts on the caller's own account — `updateUser` works on the
 * session, so one member cannot change the other's.
 */
export async function setPassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < 10) return { status: 'error', message: 'too_short' };
  if (password !== confirm) return { status: 'error', message: 'mismatch' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'not_signed_in' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: 'error', message: 'save_failed' };

  return { status: 'saved' };
}
