/**
 * Formatting a checklist condition's value.
 *
 * The four cases in the bug report are pinned literally, in Dutch, because that
 * is how they were seen: a market cap as a twelve-digit number, a decline and a
 * return on equity as two-decimal fractions.
 */
import { describe, expect, it } from 'vitest';
import { CONDITION_LABEL } from './explain';
import { CONDITION_UNIT, formatConditionValue } from './conditionFormat';

/**
 * Intl separates a currency symbol from its number with a non-breaking space,
 * which is correct output and an invisible difference in a test file. The
 * assertions normalise it rather than carrying a U+00A0 nobody can see.
 */
const fmt = (key: string, value: number | null | undefined, locale: 'en' | 'nl') =>
  formatConditionValue(key, value, locale).replace(/\u00a0/g, ' ');

describe('formatConditionValue', () => {
  it('prints a market cap as money, not as a raw integer', () => {
    expect(fmt('market_cap', 105_576_005_632, 'nl')).toBe('US$ 105,6 mld');
    expect(fmt('market_cap', 105_576_005_632, 'en')).toBe('$105.6B');
  });

  it('prints a decline as a percentage', () => {
    expect(formatConditionValue('drawdown', -0.61, 'nl')).toBe('-61,0%');
    expect(formatConditionValue('drawdown', -0.61, 'en')).toBe('-61.0%');
  });

  it('prints a return on equity as a percentage', () => {
    expect(formatConditionValue('returns', 0.63, 'nl')).toBe('63,0%');
  });

  /**
   * Cash-flow quality is a ratio in the engine and shows as one on the stock
   * page, so 1,45 is right here too — the point is that compare agrees with
   * the card, not that everything becomes a percentage.
   */
  it('leaves a ratio as a ratio', () => {
    expect(formatConditionValue('cash_flow', 1.45, 'nl')).toBe('1,45');
    expect(formatConditionValue('debt', 0.4, 'nl')).toBe('0,40');
    expect(formatConditionValue('peg', 0.73, 'nl')).toBe('0,73');
  });

  it('prints nothing for a condition that is not about a number', () => {
    expect(formatConditionValue('focus_sector', null, 'en')).toBe('');
    expect(formatConditionValue('lynch_category', null, 'en')).toBe('');
  });

  /** A tick beside a dash reads as a missing figure rather than as no figure. */
  it('prints nothing rather than a dash when there is no value', () => {
    expect(formatConditionValue('pe', null, 'en')).toBe('');
    expect(formatConditionValue('pe', undefined, 'en')).toBe('');
    expect(formatConditionValue('pe', Number.NaN, 'en')).toBe('');
  });

  it('falls back to a plain number for a condition it has never heard of', () => {
    expect(formatConditionValue('something_new', 1.5, 'en')).toBe('1.50');
  });
});

describe('CONDITION_UNIT', () => {
  /**
   * The guard that matters: a tenth condition added to the checklist without a
   * unit here would silently print a raw number, which is the bug this module
   * exists to fix.
   */
  it('covers every condition the app can label', () => {
    for (const key of Object.keys(CONDITION_LABEL)) {
      expect(CONDITION_UNIT[key], `no unit for condition "${key}"`).toBeDefined();
    }
  });

  it('does not describe conditions that do not exist', () => {
    for (const key of Object.keys(CONDITION_UNIT)) {
      expect(CONDITION_LABEL[key], `unit for unknown condition "${key}"`).toBeDefined();
    }
  });
});
