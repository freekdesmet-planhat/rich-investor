/**
 * Where to send someone back to after signing in.
 *
 * The middleware records the path it interrupted as `?next=`, and both the
 * middleware and the sign-in action read it back. It arrives from the URL, so
 * it is attacker-controlled: without a check, `?next=https://elsewhere/` turns
 * the sign-in page into an open redirect that borrows this site's credibility.
 *
 * Only a path on this site is accepted. A protocol-relative `//host` is a URL
 * to another origin despite starting with a slash, and a backslash is treated
 * as a slash by some parsers, so both are refused rather than normalised.
 */
export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;

  const trimmed = value.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return fallback;
  // A path that is itself the sign-in page would bounce straight back here.
  if (trimmed === '/login' || trimmed.startsWith('/login?')) return fallback;

  return trimmed;
}
