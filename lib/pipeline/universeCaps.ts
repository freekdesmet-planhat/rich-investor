/**
 * Writing real USD market caps back onto the universe rows (A1c).
 *
 * The `universe` table's `market_cap_band` comes from a static dataset, so ~10%
 * of the "Large cap" labels are stale — HelloFresh sits at $0.39bn under a Large
 * cap label — and a user who adds a name on that label then watches the checklist
 * fail it on size. The fix costs no extra provider call: every pipeline that
 * already fetched a quote (the watchlist run, each scan slice, an on-demand
 * analysis) knows the company's real USD cap, so it writes it back here. Search
 * then floors and labels on the real figure and falls back to the band only where
 * we have not evaluated a name yet. Over one scan cycle the labels self-correct.
 *
 * Updates, never upserts: a watchlist name a user added by hand might not be in
 * the universe, and an upsert would insert a bare, band-less row for it. An update
 * simply touches the rows that exist.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MarketCapWrite {
  symbol: string;
  marketCapUsd: number | null;
}

export async function writeMarketCaps(
  client: SupabaseClient,
  entries: MarketCapWrite[],
): Promise<number> {
  const updates = entries.filter(
    (e) => e.marketCapUsd != null && Number.isFinite(e.marketCapUsd),
  );
  if (updates.length === 0) return 0;

  await Promise.all(
    updates.map((e) =>
      client.from('universe').update({ market_cap_usd: e.marketCapUsd }).eq('symbol', e.symbol),
    ),
  );
  return updates.length;
}
