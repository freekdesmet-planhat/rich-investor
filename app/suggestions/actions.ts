'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { DISMISS_DAYS } from '@/lib/pipeline/scan';
import type { SuggestionActionState } from '@/lib/suggestions/state';

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
export async function acceptSuggestion(
  _previous: SuggestionActionState,
  formData: FormData,
): Promise<SuggestionActionState> {
  const symbol = String(formData.get('symbol') ?? '');
  if (!symbol) return { status: 'error', message: 'missing_symbol' };

  const { supabase, user } = await requireUser();

  const { data: suggestion } = await supabase
    .from('suggestions')
    .select('symbol,name,focus_sector')
    .eq('symbol', symbol)
    .maybeSingle<{ symbol: string; name: string | null; focus_sector: string }>();

  if (!suggestion) return { status: 'error', message: 'not_found' };

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
  if (watchError) return { status: 'error', message: watchError.message };

  const { error } = await supabase
    .from('suggestions')
    .update({ state: 'accepted', decided_at: new Date().toISOString(), decided_by: user.id })
    .eq('symbol', symbol);
  if (error) return { status: 'error', message: error.message };

  revalidatePath('/suggestions');
  revalidatePath('/');
  return { status: 'accepted', symbol };
}

/**
 * Dismisses a suggestion for 90 days (section 3.1).
 *
 * `rejected_until` is what keeps it out of the feed; the scan checks it before
 * re-raising anything, so a dismissal survives a re-scan rather than being
 * undone by the next nightly run.
 */
export async function dismissSuggestion(
  _previous: SuggestionActionState,
  formData: FormData,
): Promise<SuggestionActionState> {
  const symbol = String(formData.get('symbol') ?? '');
  if (!symbol) return { status: 'error', message: 'missing_symbol' };

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
  if (error) return { status: 'error', message: error.message };

  // The card leaves the feed on the next render either way — the page is
  // force-dynamic and re-reads its rows — so the undo cannot live inside the
  // card. It is rendered from `decided_at` at the top of the page instead,
  // where nothing can unmount it. See `getRecentDismissal`.
  revalidatePath('/suggestions');
  return { status: 'dismissed', symbol, days: DISMISS_DAYS };
}

/**
 * Puts a dismissed suggestion back in front of you.
 *
 * Dismissing was one tap, with no confirmation and no way back for ninety days
 * — on a phone that is a mis-tap away from quietly losing a candidate the scan
 * may not raise again for a quarter. Nothing was ever deleted, so undoing is
 * just clearing the decision: state back to pending, and the window that keeps
 * the scan away from it removed.
 */
export async function restoreSuggestion(
  _previous: SuggestionActionState,
  formData: FormData,
): Promise<SuggestionActionState> {
  const symbol = String(formData.get('symbol') ?? '');
  if (!symbol) return { status: 'error', message: 'missing_symbol' };

  const { supabase } = await requireUser();

  const { error } = await supabase
    .from('suggestions')
    .update({ state: 'pending', decided_at: null, decided_by: null, rejected_until: null })
    .eq('symbol', symbol);
  if (error) return { status: 'error', message: error.message };

  revalidatePath('/suggestions');
  return { status: 'restored', symbol };
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
