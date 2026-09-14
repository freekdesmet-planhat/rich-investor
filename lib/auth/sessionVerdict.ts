/**
 * Telling "not signed in" apart from "could not ask".
 *
 * `getUser()` revalidates the token with Supabase, which means a network round
 * trip, and a round trip can fail for reasons that say nothing about who is
 * signed in. Treating every failure as a verdict is what made a stock page
 * throw itself back to the watchlist about once in thirty loads.
 */

export interface AuthFailure {
  status?: number;
  name?: string;
}

/**
 * True only when the auth server actually answered "no".
 *
 * Supabase reports a missing or rejected session with a 4xx. Anything else — a
 * timeout, a 5xx, DNS, a dropped connection — left the question unanswered,
 * and an unanswered question is not a "no".
 */
export function isDefinitelySignedOut(error: AuthFailure | null | undefined): boolean {
  if (!error) return false;
  if (error.name === 'AuthSessionMissingError') return true;
  return typeof error.status === 'number' && error.status >= 400 && error.status < 500;
}
