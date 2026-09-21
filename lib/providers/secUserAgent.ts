/**
 * The User-Agent EDGAR requires, in one place.
 *
 * The SEC's access policy asks every automated caller to identify itself and
 * include a contact address, and `www.sec.gov` enforces it: a descriptive
 * string with no address in it is refused outright.
 *
 *   "rich-investor-app (personal analysis tool; contact via repo)"  -> 403
 *   "rich-investor-app/0.1 (you@example.com)"                       -> 200
 *
 * `data.sec.gov` is more forgiving and answers either, which is what made the
 * old arrangement so hard to see. Three modules each carried their own copy
 * of a fallback string with no contact address in it, so an unconfigured
 * deployment reached the submissions and company-facts APIs perfectly well
 * and was refused only by the ticker file — the one call that has to happen
 * first. Every EDGAR feature then failed at step one, each in its own quiet
 * way: no filings listed, no insider block, and fundamentals falling through
 * to a shallower provider without anything being logged.
 *
 * So there is no fallback any more. A contact address is not something this
 * module can invent on a deployment's behalf — inventing one would be a lie
 * told to the SEC — and pretending to have one only bought a 403 further
 * down. Unset is now an explicit, logged state, and callers skip EDGAR
 * instead of issuing a request that cannot succeed.
 */

let warned = false;

/**
 * The configured contact string, or null when the deployment has not set one.
 *
 * Warns once per process rather than per request: a cold lambda serving a
 * watchlist would otherwise log the same line sixty times.
 */
export function secUserAgent(): string | null {
  const configured = process.env.SEC_USER_AGENT?.trim();
  if (configured) return configured;

  if (!warned) {
    warned = true;
    console.warn(
      '[sec] SEC_USER_AGENT is not set. EDGAR requires a contact address ' +
        '(e.g. "rich-investor-app/0.1 (you@example.com)") and refuses requests without one, ' +
        'so filings, insider activity and EDGAR fundamentals are unavailable.',
    );
  }
  return null;
}

/** True when EDGAR can be called at all. */
export const secConfigured = (): boolean => Boolean(process.env.SEC_USER_AGENT?.trim());

/** Headers for an EDGAR request. Throws when unconfigured, so callers decide first. */
export function secHeaders(): Record<string, string> {
  const agent = secUserAgent();
  if (!agent) throw new Error('SEC_USER_AGENT is not configured');
  return { 'User-Agent': agent, accept: 'application/json' };
}
