'use server';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isEmailAllowed } from '@/lib/auth/allowlist';

export interface SignInState {
  status: 'idle' | 'sent' | 'error';
  message?: string;
}

/**
 * Sends a magic link, but only to a whitelisted address.
 *
 * `shouldCreateUser: false` would block the very first sign-in, since neither
 * member has an auth user yet — so creation stays on, and the whitelist is what
 * gates it, here and again in every RLS policy.
 *
 * The same message is returned whether or not the address is allowed, so this
 * form cannot be used to discover who has access.
 */
export async function sendMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email.includes('@')) {
    return { status: 'error', message: 'invalid_email' };
  }

  if (!(await isEmailAllowed(email))) {
    // Deliberately indistinguishable from success.
    return { status: 'sent' };
  }

  const headerStore = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${headerStore.get('x-forwarded-proto') ?? 'http'}://${headerStore.get('host')}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { status: 'error', message: error.message };
  return { status: 'sent' };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
