'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  DEFAULT_SECTOR_RULES,
  resolveFocusSector,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';
import type { SupabaseClient } from '@supabase/supabase-js';

interface MappingRow {
  symbol: string | null;
  sector: string | null;
  industry: string | null;
  focus_sector: FocusSector;
  specificity: number;
  is_excluded: boolean;
  is_payment_processor: boolean;
}

/**
 * The sector rules, from the table the nightly job uses.
 *
 * Falling back to the shipped defaults matters: a ticker added before the table
 * is seeded would otherwise land in "outside the book's focus" and carry a
 * warning it has not earned.
 */
async function sectorRules(supabase: SupabaseClient): Promise<SectorRule[]> {
  const { data } = await supabase
    .from('sector_mapping')
    .select('symbol,sector,industry,focus_sector,specificity,is_excluded,is_payment_processor')
    .returns<MappingRow[]>();

  if (!data?.length) return DEFAULT_SECTOR_RULES;

  return data.map((r) => ({
    symbol: r.symbol ?? undefined,
    sector: r.sector ?? undefined,
    industry: r.industry ?? undefined,
    focusSector: r.focus_sector,
    specificity: r.specificity,
    isExcluded: r.is_excluded,
    isPaymentProcessor: r.is_payment_processor,
  }));
}

export interface WatchlistActionState {
  status: 'idle' | 'added' | 'removed' | 'restored' | 'error';
  symbol?: string;
  name?: string | null;
  message?: string;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not_signed_in');
  return { supabase, user };
}

/**
 * Puts a ticker on the shared watchlist.
 *
 * The sector is resolved here rather than trusted from the form: the focus
 * sector decides which group the row appears under and whether it carries the
 * "outside the book's focus" warning, and a value posted by the browser is not
 * evidence of anything.
 *
 * Nothing is evaluated at this point. The nightly job picks the row up and the
 * page says so in the meantime, rather than implying an analysis exists.
 */
export async function addToWatchlist(
  _prev: WatchlistActionState,
  formData: FormData,
): Promise<WatchlistActionState> {
  const symbol = String(formData.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol) return { status: 'error', message: 'missing_symbol' };

  try {
    const { supabase, user } = await requireUser();

    const { data: row } = await supabase
      .from('universe')
      .select('symbol,name,sector,industry')
      .eq('symbol', symbol)
      .maybeSingle<{ symbol: string; name: string | null; sector: string | null; industry: string | null }>();

    if (!row) return { status: 'error', message: 'unknown_symbol' };

    const focusSector: FocusSector = resolveFocusSector(await sectorRules(supabase), {
      symbol: row.symbol,
      sector: row.sector,
      industry: row.industry,
    }).focusSector;

    const { error } = await supabase.from('watchlist_items').upsert(
      {
        user_id: user.id,
        updated_by: user.id,
        symbol: row.symbol,
        name: row.name,
        focus_sector: focusSector,
        outside_focus: focusSector === 'outside_focus',
        added_via: 'manual',
        is_shared: true,
      },
      { onConflict: 'symbol' },
    );
    if (error) return { status: 'error', message: error.message };

    revalidatePath('/');
    revalidatePath('/search');
    // The stock page renders its "on the watchlist" control from server state,
    // so without this it kept showing the old state after an add or remove
    // (audit 14). Restore routes through here, so it is covered too.
    revalidatePath(`/stock/${row.symbol}`);
    return { status: 'added', symbol: row.symbol, name: row.name };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}

/**
 * Takes a ticker off the watchlist.
 *
 * Only the membership row goes. The analysis history stays: it cost real API
 * calls to produce, the ticker may be added back tomorrow, and nothing about
 * "stop showing me this" means "forget what we learned". That is also what
 * makes undo cheap — restoring is one row, not a re-analysis.
 */
export async function removeFromWatchlist(
  _prev: WatchlistActionState,
  formData: FormData,
): Promise<WatchlistActionState> {
  const symbol = String(formData.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol) return { status: 'error', message: 'missing_symbol' };

  try {
    const { supabase } = await requireUser();

    // Read first, so undo has something to put back.
    const { data: existing } = await supabase
      .from('watchlist_items')
      .select('symbol,name')
      .eq('symbol', symbol)
      .maybeSingle<{ symbol: string; name: string | null }>();

    const { error } = await supabase.from('watchlist_items').delete().eq('symbol', symbol);
    if (error) return { status: 'error', message: error.message };

    revalidatePath('/');
    revalidatePath('/search');
    // The stock page's "on the watchlist" control is server-rendered; without
    // this it kept saying the ticker was still on the list after removal (audit 14).
    revalidatePath(`/stock/${symbol}`);
    return { status: 'removed', symbol, name: existing?.name ?? null };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}

/**
 * Puts back what `removeFromWatchlist` took off.
 *
 * Re-resolves the sector rather than carrying it through the form, for the same
 * reason `addToWatchlist` does.
 */
export async function restoreToWatchlist(
  prev: WatchlistActionState,
  formData: FormData,
): Promise<WatchlistActionState> {
  const result = await addToWatchlist(prev, formData);
  return result.status === 'added' ? { ...result, status: 'restored' } : result;
}
