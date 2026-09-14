/**
 * The shared secret that guards the scheduled endpoints.
 *
 * These are called by a machine, not a person, so there is no session to check
 * — the secret is the whole boundary. Two endpoints use it now (the nightly
 * scan and the digest), and one implementation is what stops them drifting into
 * two different ideas of "authorised".
 */

/**
 * Compares in constant time.
 *
 * A plain `===` returns as soon as two characters differ, and the time that
 * takes is measurable across enough requests. The length check leaks only the
 * length.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Whether a request carries the secret.
 *
 * Accepts either `Authorization: Bearer <secret>` or `X-Cron-Secret`, because
 * schedulers differ in what they will send.
 *
 * With no secret configured the endpoint is closed rather than open: an
 * unconfigured deployment must not expose a job that spends money.
 */
export function isAuthorisedCron(headers: Headers): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const supplied =
    headers.get('x-cron-secret') ??
    headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  return timingSafeEqual(supplied, expected);
}
