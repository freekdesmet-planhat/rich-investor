/**
 * Reading the household's threshold overrides for a pipeline run.
 *
 * Kept out of `queries.ts`, which carries the `server-only` guard: the nightly
 * job runs from a script and a route handler with a service-role client, not
 * from a request.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitiseOverrides } from '@/lib/ratios/editableThresholds';

/**
 * The overrides in force, already filtered to what may actually be applied.
 *
 * Sanitised on the way out as well as on the way in: the row is small, the
 * cost is nothing, and a value that somehow reached the database without
 * passing the form must not decide a signal.
 *
 * An empty object on any failure. A missing settings row is the normal state —
 * it exists only once somebody changes something — and a run that cannot read
 * it should use the app's own defaults rather than not run.
 */
export async function readThresholdOverrides(
  client: SupabaseClient,
): Promise<Record<string, Record<string, number>>> {
  const { data, error } = await client
    .from('analysis_settings')
    .select('thresholds')
    .maybeSingle<{ thresholds: unknown }>();

  if (error || !data) return {};
  return sanitiseOverrides(data.thresholds).overrides;
}
