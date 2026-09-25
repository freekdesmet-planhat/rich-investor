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
  /**
   * Fallback digest recipients, used before any member has saved an address.
   * Optional: the mailer degrades to "no recipient" rather than throwing, so
   * this replaces the old required NOTIFY_EMAIL, which nothing read and which
   * would have thrown at first touch. NOTIFY_EMAILS (plural) is the variable
   * the mailer actually uses.
   */
  notifyEmails: () => optional('NOTIFY_EMAILS'),

  /** Absolute site URL for the links in emails. Optional; empty means no links. */
  siteUrl: () => optional('NEXT_PUBLIC_SITE_URL'),
  /** Comma-separated sign-in allowlist, read before the table is seeded. */
  allowedEmails: () => optional('ALLOWED_EMAILS'),
  /** Nightly-scan batch-size override; the scan parses it and falls back when unset. */
  scanBatchSize: () => optional('SCAN_BATCH_SIZE'),

  geminiApiKey: () => optional('GEMINI_API_KEY'),
  fredApiKey: () => optional('FRED_API_KEY'),

  /** True when Supabase is configured well enough to read and write the cache. */
  hasSupabaseAdmin: () =>
    Boolean(optional('SUPABASE_URL') && optional('SUPABASE_SERVICE_ROLE_KEY')),

  /** Gates the optional AI summaries (section 9). */
  hasThesisProvider: () => Boolean(optional('GEMINI_API_KEY')),
  /** True when the mailer can actually send rather than simulate. */
  hasResend: () => Boolean(optional('RESEND_API_KEY')),
  /** True when the cron endpoints have a shared secret to check against. */
  hasCronSecret: () => Boolean(optional('CRON_SECRET')),
};
