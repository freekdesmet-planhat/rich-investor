/**
 * Persisting the daily macro snapshot.
 *
 * Upserted on `date`, so a re-run of the nightly job refreshes the day rather
 * than adding a second row.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMacroSnapshot, type MacroSnapshot } from './fetch';

export async function storeMacroSnapshot(
  client: SupabaseClient,
  snapshot: MacroSnapshot,
): Promise<void> {
  const { error } = await client.from('macro_context').upsert(
    {
      date: snapshot.date,
      buffett_indicator: snapshot.buffettIndicator,
      yield_spread_10y2y: snapshot.yieldSpread10y2y,
      spy_rsp_spread: snapshot.spyRspSpread,
      sp500_pe: snapshot.sp500Pe,
      sources: snapshot.sources,
      errors: snapshot.errors,
    },
    { onConflict: 'date' },
  );
  if (error) throw new Error(`macro_context upsert failed: ${error.message}`);
}

export async function refreshMacroContext(
  client: SupabaseClient,
  onProgress?: (message: string) => void,
): Promise<MacroSnapshot> {
  const snapshot = await fetchMacroSnapshot();
  await storeMacroSnapshot(client, snapshot);

  const log = onProgress ?? (() => {});
  log(
    `macro: buffett=${snapshot.buffettIndicator?.toFixed(1) ?? '—'}% ` +
      `spread=${snapshot.yieldSpread10y2y ?? '—'} ` +
      `concentration=${snapshot.spyRspSpread?.toFixed(2) ?? '—'}pp ` +
      `sp500PE=${snapshot.sp500Pe?.toFixed(1) ?? '—'}`,
  );
  for (const error of snapshot.errors) log(`macro note: ${error}`);

  return snapshot;
}
