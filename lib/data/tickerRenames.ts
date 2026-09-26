/**
 * Tickers the source dataset still carries under a stale symbol.
 *
 * FinanceDatabase lags corporate actions: Fiserv trades as FI but is still filed
 * as FISV, FleetCor became Corpay (FLT → CPAY), NortonLifeLock became Gen Digital
 * (NLOK → GEN). The new symbols mostly exist in the dataset too, so the stale ones
 * are duplicates that either retire on no-quote (dead) or, for FISV, leave the live
 * ticker (FI) missing entirely. The import applies this map so a refresh lands the
 * current symbol; until the next refresh the stale rows self-retire.
 *
 * Extend as renames surface; then refresh the universe import (logged in
 * NEXT-STEPS) to apply them.
 */
export const TICKER_RENAMES: Record<string, string> = {
  FISV: 'FI',
  FLT: 'CPAY',
  NLOK: 'GEN',
};

/** The current symbol for a raw dataset symbol, applying any known rename. */
export function renameTicker(symbol: string): string {
  return TICKER_RENAMES[symbol] ?? symbol;
}
