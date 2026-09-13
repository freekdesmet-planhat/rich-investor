/**
 * Server-only view of the email whitelist.
 *
 * Re-exports lib/auth/allowlistAdmin so application code cannot import it into
 * a client bundle — the admin module holds the service-role client, and this
 * guard is what keeps it off the browser. Scripts import the admin module
 * directly, since `server-only` throws outside a React Server Component.
 */
import 'server-only';

export { allowedEmailsFromEnv, isEmailAllowed, syncAllowlist } from './allowlistAdmin';
