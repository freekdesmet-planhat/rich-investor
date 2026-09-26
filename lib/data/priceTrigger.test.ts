import { describe, expect, it } from 'vitest';
import { priceTriggerOf } from './priceTrigger';

const cond = (key: string, passed: boolean, detail = {}) => ({
  key,
  applicable: true,
  passed,
  detail,
});

describe('priceTriggerOf', () => {
  it('returns the entry price when the decline is the only miss', () => {
    const t = priceTriggerOf([
      cond('pe', true),
      cond('drawdown', false, { high: 402.62, green: 0.5 }),
    ]);
    expect(t).toEqual({ trigger: 201.31, high: 402.62 });
  });

  it('is null when more than one condition is missed', () => {
    expect(
      priceTriggerOf([cond('debt', false), cond('drawdown', false, { high: 100, green: 0.5 })]),
    ).toBeNull();
  });

  it('is null when the single miss is not the decline', () => {
    expect(priceTriggerOf([cond('debt', false, { value: 3 })])).toBeNull();
  });

  it('is null without a usable high or threshold', () => {
    expect(priceTriggerOf([cond('drawdown', false, { high: null, green: 0.5 })])).toBeNull();
    expect(priceTriggerOf([cond('drawdown', false, { high: 100 })])).toBeNull();
  });

  it('ignores not-applicable conditions when counting misses', () => {
    const t = priceTriggerOf([
      { key: 'debt', applicable: false, passed: false, detail: {} },
      cond('drawdown', false, { high: 200, green: 0.5 }),
    ]);
    expect(t).toEqual({ trigger: 100, high: 200 });
  });
});
