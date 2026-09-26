/**
 * Deterministic nightly rotation for the price pass.
 *
 * The price pass prices the ~293 focus names every night, because only they
 * carry a stored 5-year high to trigger a decline against. The other large
 * listings only need their size labels refreshed, and a market cap does not move
 * fast enough for that to be worth a nightly quote — so they are spread across a
 * rotation: one bucket per night, every name in exactly one bucket, the whole
 * set covered once per `mod` nights.
 *
 * Two properties matter and both come from hashing the symbol rather than
 * paging it: a name stays in the same bucket run to run (so coverage is even and
 * a name is never skipped for a whole cycle by a shifting offset), and the
 * split needs no stored state. The night's bucket is the day number mod `mod`,
 * so the buckets cycle in order.
 */

/** FNV-1a over the symbol, as an unsigned 32-bit int. Small, stable, no deps. */
export function symbolHash(symbol: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    // FNV prime, kept in 32-bit range via Math.imul.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Which of `mod` buckets a symbol falls in (0..mod-1). */
export function symbolBucket(symbol: string, mod: number): number {
  if (mod <= 1) return 0;
  return symbolHash(symbol) % mod;
}

/** The bucket due tonight: the day number (UTC) mod `mod`. */
export function bucketForDate(isoDate: string, mod: number): number {
  if (mod <= 1) return 0;
  const dayNumber = Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
  return ((dayNumber % mod) + mod) % mod;
}

/** True when this symbol is in tonight's rotation slice. */
export function isDueTonight(symbol: string, isoDate: string, mod: number): boolean {
  if (mod <= 1) return true;
  return symbolBucket(symbol, mod) === bucketForDate(isoDate, mod);
}
