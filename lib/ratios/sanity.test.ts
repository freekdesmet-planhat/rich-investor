import { describe, it, expect } from 'vitest';
import { applySanity, revenueInconsistent, equityTooThin } from './sanity';
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
  it('does not size-demote ROE (a real 149% on healthy equity stands)', () => {
    // ROE is judged on its equity denominator in the engine, not on the ratio's
    // size, so applySanity leaves any ROE value untouched.
    const out = applySanity({ roe: ratio('roe', 1.49) });
    expect(out.roe.value).toBe(1.49);
    expect(out.roe.color).toBe('green');
  });

  it('does not size-demote fast growth (real hypergrowth is left alone)', () => {
    // Nvidia-style: revenue and EPS more than doubled. Not touched by applySanity.
    const out = applySanity({
      revenue_growth: ratio('revenue_growth', 1.14),
      eps_growth: ratio('eps_growth', 2.8),
    });
    expect(out.revenue_growth.value).toBe(1.14);
    expect(out.eps_growth.value).toBe(2.8);
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

describe('revenue / gross-profit consistency', () => {
  it('flags Adyen: revenue −79% while gross profit +22% (source mix)', () => {
    expect(revenueInconsistent(-0.79, 0.22)).toBe(true);
  });

  it('does not flag Nvidia: revenue and gross profit both roughly double', () => {
    expect(revenueInconsistent(1.14, 1.14)).toBe(false);
  });

  it('flags a big revenue jump gross profit barely follows', () => {
    // Revenue +80%, gross profit +5% — a gross/net reclassification, not real.
    expect(revenueInconsistent(0.8, 0.05)).toBe(true);
  });

  it('ignores ordinary moves below the ±60% floor', () => {
    expect(revenueInconsistent(0.2, -0.1)).toBe(false);
  });

  it('is null-safe', () => {
    expect(revenueInconsistent(null, 0.2)).toBe(false);
    expect(revenueInconsistent(0.9, null)).toBe(false);
  });
});

describe('ROE equity floor', () => {
  it('flags negative equity (Starbucks)', () => {
    expect(equityTooThin(-8_000_000_000, 30_000_000_000)).toBe(true);
  });
  it('flags equity under 5% of assets (GoDaddy-thin)', () => {
    expect(equityTooThin(200_000_000, 8_000_000_000)).toBe(true);
  });
  it('leaves healthy equity alone (Apple: equity well above 5%)', () => {
    expect(equityTooThin(60_000_000_000, 350_000_000_000)).toBe(false);
  });
  it('is null-safe and does not flag on missing assets', () => {
    expect(equityTooThin(null, 100)).toBe(false);
    expect(equityTooThin(5_000_000_000, null)).toBe(false);
  });
});
