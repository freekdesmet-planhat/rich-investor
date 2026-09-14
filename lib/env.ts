/**
 * Environment access.
 *
 * Optional keys degrade gracefully rather than throwing at import time: the app
 * must work without GEMINI_API_KEY (section 1) and the provider layer must be
 * runnable without Supabase so the build-step checkpoints can be executed
 * standalone.
 */

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  supabaseUrl: () => required('SUPABASE_URL'),
  supabaseAnonKey: () => required('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: () => required('SUPABASE_SERVICE_ROLE_KEY'),

  resendApiKey: () => required('RESEND_API_KEY'),
  notifyEmail: () => required('NOTIFY_EMAIL'),

  geminiApiKey: () => optional('GEMINI_API_KEY'),
  fredApiKey: () => optional('FRED_API_KEY'),

  /** True when Supabase is configured well enough to read and write the cache. */
  hasSupabaseAdmin: () =>
    Boolean(optional('SUPABASE_URL') && optional('SUPABASE_SERVICE_ROLE_KEY')),

  /** Gates the optional AI summaries (section 9). */
  hasThesisProvider: () => Boolean(optional('GEMINI_API_KEY')),
};
