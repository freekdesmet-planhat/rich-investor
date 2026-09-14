/**
 * A small per-caller rate limit.
 *
 * /api/thesis spends money on every call. It sits on a public URL behind a
 * session check, so the session is the first line — but a signed-in tab holding
 * the button down, a retry loop, or a leaked session would still run up a bill,
 * and the old server action at least made that awkward. A few calls a minute is
 * far more than a person reading one stock page needs.
 *
 * In memory, and therefore per server instance: on a platform that runs several
 * instances the effective limit is the cap times the number of instances. That
 * is the right trade here — the point is to stop a runaway loop, not to enforce
 * a quota, and a shared counter would mean a round trip to the database on
 * every request. If this ever needs to be exact, it moves to Postgres.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Calls still allowed in the current window. */
  remaining: number;
  /** Seconds until the oldest call falls out of the window. */
  retryAfter: number;
}

interface Bucket {
  /** Timestamps of the calls still inside the window, oldest first. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/** Dropped whenever the map grows past this, so it cannot leak unboundedly. */
const MAX_TRACKED_KEYS = 10_000;

/**
 * Records one call and says whether it is allowed.
 *
 * A sliding window rather than a fixed one: a fixed window lets twice the limit
 * through across a boundary, which is exactly the burst this is meant to stop.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  if (buckets.size > MAX_TRACKED_KEYS) buckets.clear();

  const bucket = buckets.get(key) ?? { hits: [] };
  const cutoff = now - windowMs;
  // Drop everything that has aged out of the window.
  const hits = bucket.hits.filter((at) => at > cutoff);

  if (hits.length >= limit) {
    buckets.set(key, { hits });
    const oldest = hits[0];
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, { hits });
  return { ok: true, remaining: limit - hits.length, retryAfter: 0 };
}

/** Test seam: forgets every caller. */
export function resetRateLimits(): void {
  buckets.clear();
}
