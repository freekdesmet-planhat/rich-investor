/**
 * Analysing one ticker on demand.
 *
 * Adding a stock used to file a row and nothing else: the watchlist said
 * "Added. The nightly scan will analyse it", and until the following night the
 * row had no ratios, no signal and no reason to be looked at. That is a long
 * time to wait for the answer to "is this one interesting", and it is a promise
 * the deployment cannot keep at all until the nightly schedule exists.
 *
 * This is the same pipeline the nightly job runs, narrowed to a single symbol
 * and with the two parts that belong to the whole run switched off:
 *
 *   - macro context is the market's weather for the day, written once by the
 *     nightly job. Adding a stock at noon is not a reason to refetch it, and
 *     doing so would let one add overwrite the day's row.
 *   - notifications are the daily digest. Adding a stock is not news that has
 *     happened to the market; it is something you just did, and you are looking
 *     at the screen.
 *
 * What it does write is the real thing: twenty ratio rows and a signal row,
 * identical to what the nightly run would have produced, so the row stops being
 * provisional the moment this returns.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runDailyPipeline, type PipelineResult } from './runDaily';

export async function analyseOnDemand(
  client: SupabaseClient,
  symbol: string,
  onProgress?: (message: string) => void,
): Promise<PipelineResult> {
  return runDailyPipeline({
    client,
    symbols: [symbol],
    skipMacro: true,
    skipNotifications: true,
    onProgress,
  });
}
