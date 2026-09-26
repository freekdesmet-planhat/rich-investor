/**
 * The priority queue between the price pass and the universe scan.
 *
 * The nightly price pass (02:12) is deliberately cheap: it batch-quotes the
 * large universe and, for a name that has just crossed a 50% (or 45%) decline
 * since its last full evaluation, writes the symbol here rather than evaluating
 * it on the spot. The universe scan (02:15) drains this list first, then spends
 * whatever budget is left on its normal cursor walk.
 *
 * Why a queue and not an inline evaluation: a crash night can cross thirty names
 * at once, and evaluating them inline would blow the price pass through the ~60s
 * execution ceiling and lose the whole run — the exact failure the sliced
 * nightly job exists to avoid. With a queue the price pass stays fast, and a
 * crash night simply spills its backlog into the following nights' scan budgets.
 *
 * `symbol` is the primary key, so re-queuing a name already waiting is a no-op:
 * a name that keeps crossing on successive nights (before the scan has drained
 * it) stays a single entry.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ScanQueueEntry {
  symbol: string;
  /** Why it was queued, e.g. "crossed -50%". Kept for telemetry, not logic. */
  reason: string;
  /** The decline the crossing was measured at, negative fraction (-0.51). */
  drawdown: number | null;
}

/** Add names to the priority list; existing rows are refreshed, not duplicated. */
export async function enqueueForScan(
  client: SupabaseClient,
  entries: ScanQueueEntry[],
): Promise<number> {
  if (entries.length === 0) return 0;
  const rows = entries.map((e) => ({
    symbol: e.symbol,
    reason: e.reason,
    drawdown: e.drawdown,
    queued_at: new Date().toISOString(),
  }));
  const { error } = await client.from('scan_queue').upsert(rows, { onConflict: 'symbol' });
  if (error) throw new Error(`scan_queue upsert failed: ${error.message}`);
  return rows.length;
}

/** The symbols waiting for a priority evaluation, oldest first. */
export async function readScanQueue(client: SupabaseClient, limit = 200): Promise<string[]> {
  const { data, error } = await client
    .from('scan_queue')
    .select('symbol')
    .order('queued_at', { ascending: true })
    .limit(limit)
    .returns<Array<{ symbol: string }>>();
  if (error) throw new Error(`scan_queue read failed: ${error.message}`);
  return (data ?? []).map((r) => r.symbol);
}

/** Remove names the scan has now evaluated, so they leave the list. */
export async function clearFromScanQueue(client: SupabaseClient, symbols: string[]): Promise<void> {
  if (symbols.length === 0) return;
  const { error } = await client.from('scan_queue').delete().in('symbol', symbols);
  if (error) throw new Error(`scan_queue delete failed: ${error.message}`);
}
