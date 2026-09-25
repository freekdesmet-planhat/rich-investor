/**
 * The email whitelist.
 *
 * Shared by the server-only wrapper (lib/auth/allowlist.ts) and by
 * scripts/sync-allowlist.ts. Kept free of the `server-only` guard so a CLI
 * script can import it; the guard lives on the wrapper the app code uses.
 *
 * Enforced in two places, deliberately:
 *
 *   here, before a magic link is ever sent, so a stranger cannot make the app
 *   email them at all; and
 *
 *   in Postgres, via is_allowed_user() on every RLS policy, so even a valid
 *   session for a non-whitelisted address reads nothing.
 *
 * The database is the real boundary — this layer exists so the failure is a
 * clear message rather than an empty app.
 *
 * ALLOWED_EMAILS seeds the `allowed_users` table; the table is what the
 * policies read, so adding someone in the database alone is enough and does not
 * need a redeploy.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';

export function allowedEmailsFromEnv(): string[] {
  return (env.allowedEmails() ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes('@'));
}

function adminClient(): SupabaseClient | null {
  if (!env.hasSupabaseAdmin()) return null;
  return createAdminClient();
}

/**
 * True when the address may sign in.
 *
 * Checks the table first, because that is what RLS enforces; the env variable
 * is a fallback for local development before the table is seeded.
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  if (!normalised.includes('@')) return false;

  const client = adminClient();
  if (client) {
    const { data, error } = await client
      .from('allowed_users')
      .select('email')
      .ilike('email', normalised)
      .maybeSingle<{ email: string }>();

    if (!error && data) return true;
    // A query error means we cannot confirm; fall through to the env list
    // rather than locking everyone out on a transient database problem.
    if (!error) return allowedEmailsFromEnv().includes(normalised);
  }

  return allowedEmailsFromEnv().includes(normalised);
}

/** Writes ALLOWED_EMAILS into `allowed_users`. Idempotent. */
export async function syncAllowlist(): Promise<{ synced: string[] }> {
  const emails = allowedEmailsFromEnv();
  const client = adminClient();
  if (!client || emails.length === 0) return { synced: [] };

  const { error } = await client
    .from('allowed_users')
    .upsert(emails.map((email) => ({ email })), { onConflict: 'email' });

  if (error) throw new Error(`allowed_users upsert failed: ${error.message}`);
  return { synced: emails };
}
