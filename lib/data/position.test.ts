/**
 * A holding, against what it cost.
 *
 * The cases worth pinning are the ones where a plausible shortcut produces
 * nonsense a reader might act on: an entry price of zero, a date in the future,
 * a size left blank because the buyer remembers the price and not the count.
 */
import { describe, expect, it } from 'vitest';
import { parsePosition, positionReturn } from './position';

const held = (over: Partial<Parameters<typeof positionReturn>[0]> = {}) => ({
  entry_price: 100,
  entry_date: '2026-06-15',
  quantity: 10,
  ...over,
});

const now = new Date('2026-09-15T12:00:00Z');

describe('positionReturn', () => {
  it('reads the change against what was paid', () => {
    expect(positionReturn(held(), 150, now).change).toBeCloseTo(0.5, 10);
    expect(positionReturn(held(), 60, now).change).toBeCloseTo(-0.4, 10);
    expect(positionReturn(held(), 100, now).change).toBe(0);
  });

  it('values the holding when a size was recorded', () => {
    const result = positionReturn(held({ quantity: 10 }), 150, now);
    expect(result.value).toBeCloseTo(1_500, 6);
    expect(result.gain).toBeCloseTo(500, 6);
  });

  /** Plenty of people remember the price and not the count. */
  it('still reports the change without a size', () => {
    const result = positionReturn(held({ quantity: null }), 150, now);
    expect(result.change).toBeCloseTo(0.5, 10);
    expect(result.value).toBeNull();
    expect(result.gain).toBeNull();
  });

  it('counts the days held', () => {
    expect(positionReturn(held({ entry_date: '2026-09-15' }), 100, now).daysHeld).toBe(0);
    expect(positionReturn(held({ entry_date: '2026-06-15' }), 100, now).daysHeld).toBe(92);
  });

  /** A date in the future is a typo, not a negative holding period. */
  it('refuses a holding period that runs backwards', () => {
    expect(positionReturn(held({ entry_date: '2027-01-01' }), 100, now).daysHeld).toBeNull();
    expect(positionReturn(held({ entry_date: 'not-a-date' }), 100, now).daysHeld).toBeNull();
  });

  it('says nothing without a usable current price', () => {
    expect(positionReturn(held(), null, now).change).toBeNull();
    expect(positionReturn(held(), undefined, now).change).toBeNull();
    expect(positionReturn(held(), Number.NaN, now).change).toBeNull();
  });

  /** An entry of zero would make every return infinite. */
  it('says nothing when the entry price is not a price', () => {
    expect(positionReturn(held({ entry_price: 0 }), 150, now).change).toBeNull();
    expect(positionReturn(held({ entry_price: -5 }), 150, now).change).toBeNull();
  });
});

describe('parsePosition', () => {
  const form = (over: Partial<Parameters<typeof parsePosition>[0]> = {}) => ({
    entryPrice: '100',
    entryDate: '2026-06-15',
    quantity: '10',
    ...over,
  });

  it('reads a filled-in form', () => {
    const result = parsePosition(form(), '2026-09-15');
    expect(result).toEqual({
      ok: true,
      value: { entryPrice: 100, entryDate: '2026-06-15', quantity: 10 },
    });
  });

  /** A Dutch keyboard produces "12,50" and means twelve fifty. */
  it('accepts a comma as a decimal separator', () => {
    const result = parsePosition(form({ entryPrice: '12,50', quantity: '1,5' }), '2026-09-15');
    expect(result.ok && result.value.entryPrice).toBe(12.5);
    expect(result.ok && result.value.quantity).toBe(1.5);
  });

  it('treats a blank size as no size rather than as zero', () => {
    const result = parsePosition(form({ quantity: '' }), '2026-09-15');
    expect(result.ok && result.value.quantity).toBeNull();
  });

  it('names what is wrong rather than guessing', () => {
    expect(parsePosition(form({ entryPrice: '0' }), '2026-09-15')).toEqual({ ok: false, reason: 'price' });
    expect(parsePosition(form({ entryPrice: 'abc' }), '2026-09-15')).toEqual({ ok: false, reason: 'price' });
    expect(parsePosition(form({ entryDate: '15-06-2026' }), '2026-09-15')).toEqual({ ok: false, reason: 'date' });
    expect(parsePosition(form({ quantity: '-4' }), '2026-09-15')).toEqual({ ok: false, reason: 'quantity' });
  });

  it('refuses a purchase that has not happened yet', () => {
    expect(parsePosition(form({ entryDate: '2026-12-01' }), '2026-09-15')).toEqual({
      ok: false,
      reason: 'future',
    });
  });
});
