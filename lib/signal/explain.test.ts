/**
 * The "why" is built from each condition's state, never a fixed template.
 *
 * These cases lock the bugs the UX audit found: a failing return listed under
 * "what passes", a failing cash-flow condition called "a sign of clean
 * accounting", an unknown PEG described as "above the ceiling", and a stored
 * verdict that claims "today" on a name that turned buy-worthy last week. One
 * case per condition it touches, across pass / fail / unknown.
 */
import { describe, expect, it } from 'vitest';
import { explainSections, type WhySection } from './explain';
import type { ConditionResult, SignalResult, SignalStatus } from './buyWorthy';
import type { RatioKey, RatioResult } from '@/lib/ratios/engine';

function ratio(key: RatioKey, over: Partial<RatioResult> = {}): RatioResult {
  return {
    key,
    value: null,
    unit: 'ratio',
    color: 'gray',
    targetLabel: '',
    targetSource: 'app_default',
    currency: null,
    thresholds: {},
    history: [],
    notApplicable: false,
    unavailableReason: null,
    detail: {},
    ...over,
  };
}

function cond(key: string, over: Partial<ConditionResult> = {}): ConditionResult {
  return { key, applicable: true, passed: false, value: null, target: '', detail: {}, ...over };
}

function signalOf(conditions: ConditionResult[], status: SignalStatus = 'watching'): SignalResult {
  const applicable = conditions.filter((c) => c.applicable);
  return {
    status,
    lynchCategory: 'average_growth',
    conditions,
    conditionsMet: applicable.filter((c) => c.passed).length,
    conditionsApplicable: applicable.length,
    pegBasis: 'none',
    reliesOnForwardPeg: false,
    ratioSnapshot: {},
    missing: applicable.filter((c) => !c.passed).map((c) => c.key),
    unjudged: applicable.filter((c) => c.unjudged).map((c) => c.key),
  };
}

/** buildOne reads drawdown_5y, roa and roe directly, so a fixture must carry them. */
function ratiosOf(over: Partial<Record<RatioKey, RatioResult>> = {}): Record<RatioKey, RatioResult> {
  return {
    // drawdown value null → the drawdown paragraph is skipped, keeping cases isolated.
    drawdown_5y: ratio('drawdown_5y', { detail: { high: 100, recoveryNeeded: null } }),
    roa: ratio('roa', { detail: {} }),
    roe: ratio('roe', { detail: { qualifyingYears: 0, yearsAvailable: 4 } }),
    ...over,
  } as Record<RatioKey, RatioResult>;
}

const en = (conditions: ConditionResult[], status?: SignalStatus, ratios = ratiosOf()) =>
  explainSections({ symbol: 'TEST', name: 'Test Co', signal: signalOf(conditions, status), ratios }).en;

const sectionOfText = (parts: { section: WhySection; text: string }[], needle: RegExp) =>
  parts.find((p) => needle.test(p.text))?.section;

describe('explain — returns condition', () => {
  const roeRatio = ratiosOf({ roe: ratio('roe', { detail: { qualifyingYears: 5, yearsAvailable: 5 } }) });

  it('files a passing return under "passes"', () => {
    const parts = en([cond('returns', { passed: true, detail: { roe: 0.22, roa: 0.09 } })], 'watching', roeRatio);
    expect(sectionOfText(parts, /ROE has stayed/)).toBe('passes');
  });

  it('files a failing return under "missing", never "passes"', () => {
    const parts = en([cond('returns', { passed: false, detail: { roe: 0.1, roa: 0.04 } })]);
    expect(sectionOfText(parts, /ROE has stayed/)).toBe('missing');
    expect(parts.some((p) => p.section === 'passes' && /ROE/.test(p.text))).toBe(false);
  });
});

describe('explain — cash-flow condition', () => {
  it('calls a passing cash-flow condition clean accounting', () => {
    const parts = en([cond('cash_flow', { passed: true, value: 1.45 })]);
    expect(sectionOfText(parts, /clean accounting/)).toBe('passes');
  });

  it('never calls a failing cash-flow condition clean accounting', () => {
    const parts = en([cond('cash_flow', { passed: false, value: -3.05 })]);
    expect(parts.some((p) => /clean accounting/.test(p.text))).toBe(false);
    expect(sectionOfText(parts, /Operating cash flow covers/)).toBe('missing');
  });
});

describe('explain — PEG condition', () => {
  it('states a passing trailing PEG under "passes"', () => {
    const parts = en([cond('peg', { passed: true, detail: { trailingPeg: 0.8, threshold: 1, basis: 'trailing', epsCagr: 0.2 } })]);
    expect(sectionOfText(parts, /PEG ratio is 0\.80/)).toBe('passes');
  });

  it('states a failing trailing PEG under "missing"', () => {
    const parts = en([cond('peg', { passed: false, detail: { trailingPeg: 2.1, threshold: 1, basis: 'none' } })]);
    expect(sectionOfText(parts, /above the 1\.0 ceiling/)).toBe('missing');
  });

  it('does not call an unknown PEG "above the ceiling"', () => {
    const parts = en([cond('peg', { passed: false, detail: { trailingPeg: null, forwardPeg: null, threshold: 1 } })]);
    const pegPart = parts.find((p) => /PEG/.test(p.text));
    expect(pegPart?.section).toBe('missing');
    expect(pegPart?.text).toMatch(/no PEG ratio on either basis/);
    expect(parts.some((p) => /unknown.*above|above.*ceiling/i.test(p.text))).toBe(false);
  });
});

describe('explain — pass-only conditions show only when passed', () => {
  it('shows the size sentence only when market cap passes', () => {
    expect(en([cond('market_cap', { passed: true, value: 3e10 })]).some((p) => /large company/.test(p.text))).toBe(true);
    expect(en([cond('market_cap', { passed: false, value: 3e9 })]).some((p) => /large company/.test(p.text))).toBe(false);
  });

  it('shows the low-debt sentence only when debt passes', () => {
    expect(en([cond('debt', { passed: true, value: 0.2 })]).some((p) => /Debt is low/.test(p.text))).toBe(true);
    expect(en([cond('debt', { passed: false, value: 4 })]).some((p) => /Debt is low/.test(p.text))).toBe(false);
  });
});

describe('explain — verdict opening', () => {
  it('is time-neutral for a buy-worthy stock: no "today"', () => {
    const conditions = [cond('market_cap', { passed: true, value: 3e10 })];
    const parts = explainSections({
      symbol: 'TEST',
      name: 'Test Co',
      signal: signalOf(conditions, 'buy_worthy'),
      ratios: ratiosOf(),
    });
    const verdict = parts.en.find((p) => p.section === 'verdict');
    expect(verdict?.text).not.toMatch(/today/);
    expect(verdict?.text).toMatch(/meets all/);
    expect(parts.nl.find((p) => p.section === 'verdict')?.text).not.toMatch(/vandaag/);
  });
});
