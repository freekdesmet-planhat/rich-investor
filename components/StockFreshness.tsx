import type { StockFreshnessView } from '@/lib/data/stockFreshness';

/**
 * The per-stock freshness lines: when it was analysed, which day's close the
 * price is, and which annual report the fundamentals come from (audit 11).
 *
 * Presentational only — the strings arrive already built and localised by
 * {@link buildStockFreshness}, so this holds no copy and no date logic of its own.
 */
export function StockFreshness({ age, priceLine, financialsLine }: StockFreshnessView) {
  if (!age && !priceLine && !financialsLine) return null;

  return (
    <div className="text-ink-faint space-y-0.5 text-xs">
      {age && <p>{age}</p>}
      {priceLine && <p>{priceLine}</p>}
      {financialsLine && <p>{financialsLine}</p>}
    </div>
  );
}
