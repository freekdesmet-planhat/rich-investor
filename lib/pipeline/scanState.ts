/**
 * The universe scan's shared state: cursor, cost estimate and circuit breaker.
 *
 * All three live in the one-row `scan_cursor` table (migration 0039). The cursor
 * used to live in macro_context.detail as JSON and was advanced read-modify-write,
 * which was safe only while one slice ran a night. The scan runs in four slices
 * now, so the cursor is claimed atomically instead: claimScanBatch reserves a
 * row range and returns its start, and the DB row lock guarantees two slices
 * never get the same range — the thing that would double our traffic to an
 * unofficial, single-IP quote provider.
 *
 * The breaker is a date: a slice that sees the provider rate-limiting sets it to
 * today, and the night's remaining slices read it and stand down rather than keep
 * calling a provider that is already throttling us.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ScanControl {
  /** Measured cost per candidate, for the budget. Null until a night has one. */
  msPerCandidate: number | null;
  /** The date the breaker was tripped, or null. */
  breakerDate: string | null;
}

export async function readScanControl(client: SupabaseClient): Promise<ScanControl> {
  const { data } = await client
    .from('scan_cursor')
    .select('ms_per_candidate,breaker_date')
    .eq('id', true)
    .maybeSingle<{ ms_per_candidate: number | null; breaker_date: string | null }>();
  return {
    msPerCandidate: data?.ms_per_candidate ?? null,
    breakerDate: data?.breaker_date ?? null,
  };
}

/** True when the breaker was tripped today, so this slice should stand down. */
export function isBreakerOpen(breakerDate: string | null, today: string): boolean {
  return breakerDate != null && breakerDate === today;
}

/**
 * Atomically reserve `claimRows` rows and get the offset to start at. The row
 * lock in the RPC is what stops two slices claiming the same range.
 */
export async function claimScanBatch(client: SupabaseClient, claimRows: number): Promise<number> {
  const { data, error } = await client.rpc('claim_scan_batch', { p_claim: claimRows });
  if (error) throw new Error(`claim_scan_batch failed: ${error.message}`);
  return Number(data);
}

/** Reset the cursor to the start, for the slice that ran off the end. */
export async function resetScanCursor(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('reset_scan_cursor');
  if (error) throw new Error(`reset_scan_cursor failed: ${error.message}`);
}

/** Carry the measured cost into the next slice's budget. */
export async function saveScanCost(client: SupabaseClient, msPerCandidate: number): Promise<void> {
  await client
    .from('scan_cursor')
    .update({ ms_per_candidate: msPerCandidate, updated_at: new Date().toISOString() })
    .eq('id', true);
}

/** Open the breaker for the rest of tonight. */
export async function tripBreaker(client: SupabaseClient, today: string): Promise<void> {
  await client.from('scan_cursor').update({ breaker_date: today }).eq('id', true);
}
