'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export interface WaitlistState {
  status: 'idle' | 'joined' | 'invalid' | 'error';
}

// Deliberately forgiving: one @, a dot in the domain, no spaces. The point is to
// catch a typo, not to police RFC 5322 — the confirmation email is the real check.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds an email to the public waitlist (launch item 11).
 *
 * Written with the service-role client because the table is closed to the anon
 * role — the landing page is public, but the list is not readable by anyone but
 * the job that will one day mail it. A repeat email is a no-op, not an error, so
 * a second submit still reads as success rather than leaking who is already on it.
 */
export async function joinWaitlist(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const locale = String(formData.get('locale') ?? '') || null;
  if (!email || email.length > 320 || !EMAIL.test(email)) return { status: 'invalid' };

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('waitlist')
      .upsert({ email, locale }, { onConflict: 'email', ignoreDuplicates: true });
    if (error) return { status: 'error' };
    return { status: 'joined' };
  } catch {
    return { status: 'error' };
  }
}
