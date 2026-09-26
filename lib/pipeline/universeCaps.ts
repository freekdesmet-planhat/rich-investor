/**
 * Writing evaluation-derived figures back onto the universe rows (A1c, A12b).
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
 * A full evaluation also knows the company's five-year high and the decline
 * against it, and those go back too (A12b): the nightly price pass fetches a price
 * but no history, so it needs the stored high to recompute the decline and catch a
 * name crossing the entry line between full evaluations. The price pass itself has
 * no history, so it writes only the cap (leaving the high untouched).
 *
 * Updates, never upserts: a watchlist name a user added by hand might not be in
 * the universe, and an upsert would insert a bare, band-less row for it. An update
 * simply touches the rows that exist, and only the fields it was given.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MarketCapWrite {
  symbol: string;
  marketCapUsd: number | null;
  /** The five-year high at this evaluation (A12b). Omitted by the price pass. */
  priceHigh5y?: number | null;
  /** The decline against that high at this evaluation, negative fraction (A12b). */
  drawdown5y?: number | null;
}

const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

export async function writeMarketCaps(
  client: SupabaseClient,
  entries: MarketCapWrite[],
): Promise<number> {
  // Build the per-row update from whatever finite figures the caller supplied, so
  // the price pass (cap only) and a full evaluation (cap + high + drawdown) share
  // one path without one clobbering the other's fields with nulls.
  const updates = entries
    .map((e) => {
      const patch: Record<string, number> = {};
      if (finite(e.marketCapUsd)) patch.market_cap_usd = e.marketCapUsd;
      if (finite(e.priceHigh5y)) patch.price_high_5y = e.priceHigh5y;
      if (finite(e.drawdown5y)) patch.drawdown_5y = e.drawdown5y;
      return { symbol: e.symbol, patch };
    })
    .filter((u) => Object.keys(u.patch).length > 0);
  if (updates.length === 0) return 0;

  await Promise.all(
    updates.map((u) => client.from('universe').update(u.patch).eq('symbol', u.symbol)),
  );
  return updates.length;
}
