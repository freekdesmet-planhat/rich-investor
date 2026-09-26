import { describe, it, expect } from 'vitest';
import { crossedThreshold, CROSS_THRESHOLDS } from './pricePass';
import { capCurrency } from '@/lib/providers/fx';

describe('market-cap currency', () => {
  it('resolves the GBp/GBX pence alias to GBP (cap is already in pounds)', () => {
    expect(capCurrency('GBp')).toBe('GBP');
    expect(capCurrency('GBX')).toBe('GBP');
  });
  it('passes real currencies through and defaults null to USD', () => {
    expect(capCurrency('EUR')).toBe('EUR');
    expect(capCurrency('USD')).toBe('USD');
    expect(capCurrency(null)).toBe('USD');
  });
});

describe('price-pass decline crossing', () => {
  it('queues a name that crosses -50% since its last evaluation', () => {
    // Was down 30% at last eval, now down 52% -> crossed both, deepest wins.
    expect(crossedThreshold(-0.3, -0.52)).toBe(-0.5);
  });

  it('queues a name that crosses only -45%', () => {
    expect(crossedThreshold(-0.3, -0.47)).toBe(-0.45);
  });

  it('queues a name that newly crosses -50% from just above it', () => {
    expect(crossedThreshold(-0.47, -0.51)).toBe(-0.5);
  });

  it('does not re-queue a name already below the line that merely fell further', () => {
    // The whole point of "crossing not level": baseline moved down at last eval.
    expect(crossedThreshold(-0.52, -0.55)).toBeNull();
  });

  it('does not queue a name that has recovered', () => {
    expect(crossedThreshold(-0.3, -0.2)).toBeNull();
  });

  it('does not queue a name still shy of the first line', () => {
    expect(crossedThreshold(-0.1, -0.4)).toBeNull();
  });

  it('the thresholds are the two book lines', () => {
    expect([...CROSS_THRESHOLDS]).toEqual([-0.45, -0.5]);
  });
});
