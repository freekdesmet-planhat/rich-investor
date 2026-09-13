'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { DISMISS_DAYS } from '@/lib/pipeline/scan';

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  return { supabase, user };
}

/**
 * Accepts a suggestion onto the shared watchlist.
 *
 * The watchlist row records who added it, but is shared with the household —
 * so the other member sees it immediately. Both writes go through the user's
 * own session, so RLS decides whether they are allowed.
 */
export async function acceptSuggestion(formData: FormData): Promise<void> {
  const symbol = String(formData.get('symbol') ?? '');
  if (!symbol) return;

  const { supabase, user } = await requireUser();

  const { data: suggestion } = await supabase
    .from('suggestions')
    .select('symbol,name,focus_sector')
    .eq('symbol', symbol)
    .maybeSingle<{ symbol: string; name: string | null; focus_sector: string }>();

  if (!suggestion) return;

  const { error: watchError } = await supabase.from('watchlist_items').upsert(
    {
      user_id: user.id,
      updated_by: user.id,
      symbol: suggestion.symbol,
      name: suggestion.name,
      focus_sector: suggestion.focus_sector,
      outside_focus: suggestion.focus_sector === 'outside_focus',
      added_via: 'suggestion',
      is_shared: true,
    },
    { onConflict: 'symbol' },
  );
  if (watchError) throw new Error(watchError.message);

  const { error } = await supabase
    .from('suggestions')
    .update({ state: 'accepted', decided_at: new Date().toISOString(), decided_by: user.id })
    .eq('symbol', symbol);
  if (error) throw new Error(error.message);

  revalidatePath('/suggestions');
  revalidatePath('/');
}

/**
 * Dismisses a suggestion for 90 days (section 3.1).
 *
 * `rejected_until` is what keeps it out of the feed; the scan checks it before
 * re-raising anything, so a dismissal survives a re-scan rather than being
 * undone by the next nightly run.
 */
export async function dismissSuggestion(formData: FormData): Promise<void> {
  const symbol = String(formData.get('symbol') ?? '');
  if (!symbol) return;

  const { supabase, user } = await requireUser();

  const until = new Date();
  until.setUTCDate(until.getUTCDate() + DISMISS_DAYS);

  const { error } = await supabase
    .from('suggestions')
    .update({
      state: 'rejected',
      decided_at: new Date().toISOString(),
      decided_by: user.id,
      rejected_until: until.toISOString().slice(0, 10),
    })
    .eq('symbol', symbol);
  if (error) throw new Error(error.message);

  revalidatePath('/suggestions');
}

/** Removes a ticker from the shared watchlist. */
export async function removeFromWatchlist(formData: FormData): Promise<void> {
  const symbol = String(formData.get('symbol') ?? '');
  if (!symbol) return;

  const { supabase } = await requireUser();
  const { error } = await supabase.from('watchlist_items').delete().eq('symbol', symbol);
  if (error) throw new Error(error.message);

  revalidatePath('/');
}
