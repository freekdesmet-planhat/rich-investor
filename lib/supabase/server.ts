/**
 * Request-scoped Supabase client for server components and route handlers.
 *
 * Carries the signed-in user's session, so every query runs under RLS as that
 * user. This is the client the UI should use; the service-role client is for
 * the daily job and import scripts only.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Public variables are inlined at build time, so set ` +
        `it in the build environment and redeploy.`,
    );
  }
  return value;
}

export async function createClient(): Promise<SupabaseClient> {
  const store = await cookies();

  return createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Called from a server component, where cookies are read-only.
            // Session refresh is handled by the middleware instead.
          }
        },
      },
    },
  );
}
