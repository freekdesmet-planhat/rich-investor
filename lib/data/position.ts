/**
 * What a holding is worth against what it cost.
 *
 * The review block carries the book's full sell-signal checklist — declining
 * performance, an acquisition at a high premium, a CFO leaving involuntarily —
 * and the app has never known whether you own the thing. Half the framework was
 * a questionnaire about a hypothetical. Recording an entry turns it into a
 * review of a real holding, and puts the one number the sell decision actually
 * hangs on next to it.
 *
 * Pure: the arithmetic is small and the edge cases are the interesting part.
 */

export interface Position {
  symbol: string;
  /** What you paid per share, in the currency the shares trade in. */
  entry_price: number;
  entry_date: string;
  /** Optional: plenty of people remember the price and not the size. */
  quantity: number | null;
  currency: string | null;
  note: string | null;
}

export interface PositionReturn {
  /** Change since entry, as a fraction. Null without a usable current price. */
  change: number | null;
  /** Current value of the holding, when a size was recorded. */
  value: number | null;
  /** Gain or loss in money, when a size was recorded. */
  gain: number | null;
  /** Days held, for reading a return against the time it took. */
  daysHeld: number | null;
}

/**
 * The return on a holding.
 *
 * Both prices are in the currency the shares trade in — `entry_price` is what
 * the buyer paid and `price` comes from the same quote — so no conversion is
 * involved and none is invented. A non-positive entry price yields nothing
 * rather than an infinite return.
 */
export function positionReturn(
  position: Pick<Position, 'entry_price' | 'entry_date' | 'quantity'>,
  price: number | null | undefined,
  now: Date = new Date(),
): PositionReturn {
  const usable =
    price != null &&
    Number.isFinite(price) &&
    Number.isFinite(position.entry_price) &&
    position.entry_price > 0;

  const change = usable ? price / position.entry_price - 1 : null;
  const size = position.quantity != null && position.quantity > 0 ? position.quantity : null;

  return {
    change,
    value: usable && size != null ? price * size : null,
    gain: usable && size != null ? (price - position.entry_price) * size : null,
    daysHeld: daysSince(position.entry_date, now),
  };
}

function daysSince(date: string, now: Date): number | null {
  const entry = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(entry)) return null;

  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.round((today - entry) / 86_400_000);
  // A date in the future is a typo, not a negative holding period.
  return days >= 0 ? days : null;
}

export interface PositionForm {
  entryPrice: string;
  entryDate: string;
  quantity: string;
}

export interface ParsedPosition {
  entryPrice: number;
  entryDate: string;
  quantity: number | null;
}

/**
 * Reads what was typed, and says why it will not do.
 *
 * Returns a reason rather than throwing, because every one of these is a thing
 * a person can mistype and the form has to say which.
 */
export function parsePosition(
  form: PositionForm,
  today = new Date().toISOString().slice(0, 10),
): { ok: true; value: ParsedPosition } | { ok: false; reason: string } {
  const entryPrice = Number(String(form.entryPrice).replace(',', '.').trim());
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return { ok: false, reason: 'price' };
  }

  const entryDate = String(form.entryDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || Number.isNaN(Date.parse(entryDate))) {
    return { ok: false, reason: 'date' };
  }
  if (entryDate > today) return { ok: false, reason: 'future' };

  const raw = String(form.quantity ?? '').replace(',', '.').trim();
  if (raw === '') return { ok: true, value: { entryPrice, entryDate, quantity: null } };

  const quantity = Number(raw);
  if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, reason: 'quantity' };

  return { ok: true, value: { entryPrice, entryDate, quantity } };
}
