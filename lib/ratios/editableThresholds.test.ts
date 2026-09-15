/**
 * Which thresholds may be changed, and what a form is allowed to send.
 *
 * The load-bearing test is the first: the book's numbers must not be editable.
 * Everything else here is about not trusting a form whose values decide whether
 * a stock is called buy-worthy.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, mergeThresholds } from './thresholds';
import {
  EDITABLE_KEYS,
  overriddenTargetLabel,
  defaultFieldsFor,
  isEditableKey,
  isOverridden,
  RATIO_THRESHOLD,
  sanitiseOverrides,
} from './editableThresholds';

describe('which thresholds are editable', () => {
  /** The framework is the product; a spreadsheet is not. */
  it('never offers the book’s own numbers', () => {
    for (const key of ['pe', 'peg', 'drawdown', 'marketCap', 'roe', 'roa', 'epsGrowth']) {
      expect(isEditableKey(key), `${key} must not be editable`).toBe(false);
    }
  });

  it('offers exactly the thresholds the app admits it chose', () => {
    for (const key of EDITABLE_KEYS) {
      expect(DEFAULT_THRESHOLDS[key].source).toBe('app_default');
    }
    const appDefaults = Object.entries(DEFAULT_THRESHOLDS)
      .filter(([, t]) => t.source === 'app_default')
      .map(([k]) => k);
    expect([...EDITABLE_KEYS].sort()).toEqual(appDefaults.sort());
  });

  it('knows the fields each one has', () => {
    expect(defaultFieldsFor('evEbit')).toEqual({ green: 20, orange: 28 });
    expect(defaultFieldsFor('debt')).toMatchObject({ netDebtEbitdaGreen: 1, netDebtEbitdaOrange: 2.5 });
  });

  /** Every editable threshold a card points at must exist. */
  it('maps ratio cards onto editable thresholds only', () => {
    for (const key of Object.values(RATIO_THRESHOLD)) {
      expect(isEditableKey(key)).toBe(true);
    }
  });
});

describe('sanitiseOverrides', () => {
  it('keeps a good value', () => {
    const { overrides, rejected } = sanitiseOverrides({ evEbit: { green: 15 } });
    expect(overrides).toEqual({ evEbit: { green: 15 } });
    expect(rejected).toEqual([]);
  });

  it('reads a number typed with a comma', () => {
    expect(sanitiseOverrides({ pFcf: { green: '22,5' } }).overrides).toEqual({ pFcf: { green: 22.5 } });
  });

  it('refuses the book’s thresholds outright', () => {
    const { overrides, rejected } = sanitiseOverrides({ pe: { green: 999 } });
    expect(overrides).toEqual({});
    expect(rejected).toEqual([{ key: 'pe', reason: 'not_editable' }]);
  });

  /** A key no rule reads would be a setting that appears to do something. */
  it('drops a field the threshold does not have', () => {
    const { overrides, rejected } = sanitiseOverrides({ evEbit: { purple: 3 } });
    expect(overrides).toEqual({});
    expect(rejected).toEqual([{ key: 'evEbit', field: 'purple', reason: 'unknown_field' }]);
  });

  it('drops anything that is not a positive number', () => {
    const { rejected } = sanitiseOverrides({ evEbit: { green: 0, orange: 'abc' } });
    expect(rejected).toHaveLength(2);
    expect(rejected.every((r) => r.reason === 'not_a_number')).toBe(true);
  });

  it('copes with nothing at all', () => {
    expect(sanitiseOverrides(null).overrides).toEqual({});
    expect(sanitiseOverrides('nonsense').overrides).toEqual({});
    expect(sanitiseOverrides({}).overrides).toEqual({});
  });

  /** The output has to be something mergeThresholds will actually apply. */
  it('produces overrides the engine merges', () => {
    const { overrides } = sanitiseOverrides({ evEbit: { green: 15 } });
    const merged = mergeThresholds(overrides);

    expect(merged.evEbit.value.green).toBe(15);
    // Untouched fields survive, and so does every other threshold.
    expect(merged.evEbit.value.orange).toBe(DEFAULT_THRESHOLDS.evEbit.value.orange);
    expect(merged.pe.value.green).toBe(DEFAULT_THRESHOLDS.pe.value.green);
  });
});

describe('isOverridden', () => {
  it('is false when the stored value matches what the app ships', () => {
    expect(isOverridden('evEbit', { evEbit: { green: 20 } })).toBe(false);
    expect(isOverridden('evEbit', {})).toBe(false);
    expect(isOverridden('evEbit', null)).toBe(false);
  });

  it('is true once a number actually differs', () => {
    expect(isOverridden('evEbit', { evEbit: { green: 15 } })).toBe(true);
  });
});

describe('overriddenTargetLabel', () => {
  const format = (v: number) => String(v);

  /** The documented "≤ 20" is prose; it does not follow the threshold. */
  it('rebuilds the target from the value in force', () => {
    expect(overriddenTargetLabel('ev_ebit', { evEbit: { green: 15 } }, format)).toBe('≤ 15');
    expect(overriddenTargetLabel('p_fcf', { pFcf: { green: 18 } }, format)).toBe('≤ 18');
    expect(overriddenTargetLabel('debt', { debt: { netDebtEbitdaGreen: 0.5 } }, format)).toBe('≤ 0.5');
  });

  it('reads a fraction back as a percentage', () => {
    expect(overriddenTargetLabel('revenue_growth', { revenueGrowth: { green: 0.12 } }, format)).toBe(
      '≥ 12%',
    );
  });

  it('leaves the documented text alone when nothing changed', () => {
    expect(overriddenTargetLabel('ev_ebit', { evEbit: { green: 20 } }, format)).toBeNull();
    expect(overriddenTargetLabel('ev_ebit', {}, format)).toBeNull();
    expect(overriddenTargetLabel('pe', { pe: { green: 5 } }, format)).toBeNull();
  });
});
