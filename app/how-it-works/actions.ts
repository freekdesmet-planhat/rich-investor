'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Marks the primer as seen and sends the member on to the watchlist.
 *
 * Reached from both "Skip" and "Start using it", and deliberately the same
 * action for both: the question the flag answers is "has this person been
 * offered the primer", not "did they read all four steps". Someone who skips
 * it has been offered it, and showing it again on their next visit would be
 * ignoring an answer they already gave.
 *
 * A failure to write the flag is not worth blocking on. The worst case is
 * that the primer appears once more, which is a smaller cost than a sign-in
 * that dead-ends on an error page.
 */
export async function finishOnboarding(): Promise<never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase
      .from('settings')
      .upsert(
        { user_id: user.id, onboarded_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    revalidatePath('/', 'layout');
  }

  redirect('/');
}
