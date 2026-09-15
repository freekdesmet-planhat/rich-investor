'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parsePosition } from '@/lib/data/position';
import type { PositionActionState } from '@/lib/positions/state';

/**
 * Records what you paid for a holding, or updates it.
 *
 * `user_id` is always auth.uid() and never taken from the form, so one member
 * of a household cannot write a position into the other's name. RLS enforces
 * the same thing at the database; this makes it impossible to even ask for.
 *
 * Upserted on (user_id, symbol): buying more of something you already hold is a
 * change to the entry you are measuring against, not a second row. Anything
 * more than that is a portfolio tracker rather than the one figure the sell
 * checklist needs.
 */
export async function savePosition(
  _previous: PositionActionState,
  formData: FormData,
): Promise<PositionActionState> {
  const symbol = String(formData.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol) return { status: 'error', reason: 'symbol' };

  const parsed = parsePosition({
    entryPrice: String(formData.get('entry_price') ?? ''),
    entryDate: String(formData.get('entry_date') ?? ''),
    quantity: String(formData.get('quantity') ?? ''),
  });
  if (!parsed.ok) return { status: 'error', reason: parsed.reason };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', reason: 'not_signed_in' };

  const { error } = await supabase.from('positions').upsert(
    {
      user_id: user.id,
      symbol,
      entry_price: parsed.value.entryPrice,
      entry_date: parsed.value.entryDate,
      quantity: parsed.value.quantity,
      currency: String(formData.get('currency') ?? '').trim() || null,
      note: String(formData.get('note') ?? '').trim() || null,
    },
    { onConflict: 'user_id,symbol' },
  );
  if (error) return { status: 'error', message: error.message };

  revalidatePath(`/stock/${symbol}`);
  return { status: 'saved' };
}

/** Removes a holding — sold, or recorded by mistake. */
export async function clearPosition(
  _previous: PositionActionState,
  formData: FormData,
): Promise<PositionActionState> {
  const symbol = String(formData.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol) return { status: 'error', reason: 'symbol' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 'error', reason: 'not_signed_in' };

  // Scoped to this user explicitly as well as by RLS: the intent is "mine",
  // and saying so here means the query cannot be read as anything else.
  const { error } = await supabase
    .from('positions')
    .delete()
    .eq('symbol', symbol)
    .eq('user_id', user.id);
  if (error) return { status: 'error', message: error.message };

  revalidatePath(`/stock/${symbol}`);
  return { status: 'cleared' };
}
