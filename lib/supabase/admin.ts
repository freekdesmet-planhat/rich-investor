/**
 * Service-role Supabase client, for the daily job and the import scripts.
 *
 * This client bypasses RLS, so it must never be imported into anything that
 * runs in the browser or serves a user request directly.
 */
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
