import { describe, it, expect } from 'vitest';
import { applySanity } from './sanity';
import type { RatioResult, RatioKey } from './engine';

function ratio(key: RatioKey, value: number | null, color: RatioResult['color'] = 'green'): RatioResult {
  return {
    key,
    value,
    unit: 'ratio',
    color,
    targetLabel: '',
    targetSource: 'app_default',
    currency: null,
    thresholds: {},
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: {},
  };
}

describe('data sanity layer', () => {
  it('demotes an ROE above 100% to grey unreliable, keeping the raw value', () => {
    const out = applySanity({ roe: ratio('roe', 4.43) });
    expect(out.roe.value).toBeNull();
    expect(out.roe.color).toBe('gray');
    expect(out.roe.unavailableReason).toBe('unreliable');
    expect((out.roe.detail as { rawValue?: number }).rawValue).toBe(4.43);
  });

  it('leaves a high-but-real ROE alone', () => {
    const out = applySanity({ roe: ratio('roe', 0.6) });
    expect(out.roe.value).toBe(0.6);
    expect(out.roe.color).toBe('green');
  });

  it('demotes a year-on-year growth beyond ±60%', () => {
    const out = applySanity({
      revenue_growth: ratio('revenue_growth', -0.79),
      eps_growth: ratio('eps_growth', 0.4),
    });
    expect(out.revenue_growth.unavailableReason).toBe('unreliable');
    expect(out.eps_growth.value).toBe(0.4); // within range
  });

  it('demotes a negative cash-conversion ratio', () => {
    const out = applySanity({ earnings_quality: ratio('earnings_quality', -3.05) });
    expect(out.earnings_quality.unavailableReason).toBe('unreliable');
  });

  it('leaves an already-grey or missing ratio untouched', () => {
    const grey = ratio('roe', null, 'gray');
    const out = applySanity({ roe: grey });
    expect(out.roe).toBe(grey);
  });
});
