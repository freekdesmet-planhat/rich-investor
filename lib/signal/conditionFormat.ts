/**
 * Formatting a checklist condition's value.
 *
 * A stored condition carries a bare number and nothing saying what kind of
 * number it is, because the page that first displayed one — the stock page —
 * shows the condition's *target* in words and never prints the value at all.
 * The compare table does print it, and printed all nine the same way: a market
 * cap came out as 105.576.005.632,00, a 61% decline as -0,61 and a 63% return
 * on equity as 0,63. Every figure correct, every figure unreadable.
 *
 * The unit of each condition is the unit of the ratio it was derived from —
 * `buyWorthy.ts` copies the value straight off that ratio — so this table
 * mirrors the engine rather than inventing a second opinion. The comment on
 * each line names the ratio it came from; a test pins the set of keys to the
 * set of conditions, so adding a tenth condition fails loudly here rather than
 * quietly printing a raw number.
 */
import { formatBillions, formatNumber, formatPercent } from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/locale';

/** The subset of the engine's units a condition value can have. */
export type ConditionUnit = 'percent' | 'ratio' | 'currency' | 'none';

export const CONDITION_UNIT: Record<string, ConditionUnit> = {
  // Both carry no number at all — the verdict is the whole content.
  focus_sector: 'none',
  lynch_category: 'none',

  market_cap: 'currency', // market_cap, in USD: the $10bn rule is written in USD
  drawdown: 'percent', // drawdown_5y, a negative fraction
  peg: 'ratio', // peg
  pe: 'ratio', // pe
  returns: 'percent', // roe
  cash_flow: 'ratio', // earnings_quality — operating cash flow over net income
  debt: 'ratio', // debt, net debt/EBITDA
};

/**
 * The condition's value, in the same shape the rest of the app shows it.
 *
 * Returns an empty string rather than a dash when there is nothing to print:
 * the cell already carries a tick or a cross, and "✓ —" reads as a missing
 * number rather than as a condition that is simply not about one.
 */
export function formatConditionValue(
  key: string,
  value: number | null | undefined,
  locale: Lang,
): string {
  if (value == null || !Number.isFinite(value)) return '';

  switch (CONDITION_UNIT[key] ?? 'ratio') {
    case 'none':
      return '';
    case 'currency':
      // USD, and said so, because the market-cap rule is stated in USD while
      // the price on the stock page is in the currency the shares trade in.
      return formatBillions(value, 'USD', locale);
    case 'percent':
      return formatPercent(value, locale);
    case 'ratio':
    default:
      return formatNumber(value, locale);
  }
}
