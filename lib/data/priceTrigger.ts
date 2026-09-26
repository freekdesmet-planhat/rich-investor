/**
 * The price at which a stock would pass its last open condition (launch item 10).
 *
 * When the 50% decline is the *only* condition a stock still misses, the price it
 * would pass at is arithmetic: the 5-year high times (1 − the threshold), e.g. a
 * high of €402.62 with a 50% rule passes at €201.31. This says so on the stock
 * page and its "Almost there" card, and it is what the opt-in nightly alert
 * watches. Null whenever the decline is not the sole remaining condition — the
 * figure only means something when it is the one thing in the way.
 */
export interface PriceTrigger {
  /** The price the stock passes at. */
  trigger: number;
  /** The 5-year high the trigger is derived from. */
  high: number;
}

interface ChecklistCondition {
  key: string;
  applicable: boolean;
  passed: boolean;
  detail: Record<string, unknown>;
}

export function priceTriggerOf(checklist: ChecklistCondition[]): PriceTrigger | null {
  const missed = checklist.filter((c) => c.applicable && !c.passed);
  if (missed.length !== 1 || missed[0].key !== 'drawdown') return null;

  const detail = missed[0].detail as { high?: number | null; green?: number | null };
  const high = detail.high;
  const green = detail.green;
  if (high == null || green == null || !(high > 0) || !(green > 0) || green >= 1) return null;

  return { trigger: high * (1 - green), high };
}
