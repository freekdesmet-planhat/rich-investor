/**
 * Signal and explanation tests.
 *
 * Covers one case per status rule, the applicable-condition denominator, the
 * PEG trailing/forward rule, and that the explanation cites the values actually
 * computed rather than a static sentence.
 */
import { describe, expect, it } from 'vitest';
import { buildContext, computeAllRatios, type RatioKey, type RatioResult } from '@/lib/ratios/engine';
import { evaluateSignal, type SignalResult } from './buyWorthy';
import { explainSignal, explainForEmail, explainSections } from './explain';
import { classifyLynch, pegCategoryFor } from './lynch';
import { checkInvariants } from '@/lib/ratios/invariants';
import type { SymbolBundle } from '@/lib/providers/marketData';
import type { FinancialStatement, MetricName, PricePoint } from '@/lib/providers/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function statement(
  kind: 'income' | 'balance' | 'cash',
  periods: Array<[string, Partial<Record<MetricName, number>>]>,
): FinancialStatement {
  return {
    symbol: 'TEST',
    kind,
    frequency: 'annual',
    periods: periods
      .map(([endDate, metrics]) => ({ endDate, metrics }))
      .sort((a, b) => b.endDate.localeCompare(a.endDate)),
  };
}

const prices = (points: Array<[string, number]>): PricePoint[] =>
  points.map(([date, close]) => ({
    date,
    open: close,
    high: close,
    low: close,
    close,
    adjClose: close,
    volume: 0,
  }));

/** A company that clears every condition: the book's success pattern. */
function idealBundle(overrides: Partial<SymbolBundle> = {}): SymbolBundle {
  const years = ['2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31', '2025-12-31'];
  const eps = [2, 2.6, 3.4, 4.4, 5.7];
  const netIncome = eps.map((e) => e * 1_000_000_000);

  return {
    symbol: 'TEST',
    asOf: '2026-09-13',
    quote: {
      symbol: 'TEST',
      name: 'Test Co',
      price: 60,
      currency: 'USD',
      marketCap: 120_000_000_000,
      previousClose: null,
      open: null,
      dayHigh: null,
      dayLow: null,
      volume: null,
      exchange: null,
      sector: 'Information Technology',
      industry: 'Software',
      nextEarningsDate: null,
      beta: null,
      dividendPerShare: null,
      employees: null,
      description: null,
    },
    statements: {
      income: {
        annual: statement(
          'income',
          years.map((y, i) => [
            y,
            {
              dilutedEps: eps[i],
              netIncome: netIncome[i],
              revenue: netIncome[i] * 3,
              grossProfit: netIncome[i] * 2.2,
              ebit: netIncome[i] * 1.3,
              ebitda: netIncome[i] * 1.5,
              dilutedShares: 1_000_000_000,
            },
          ]),
        ),
        quarterly: null,
      },
      balance: {
        annual: statement(
          'balance',
          years.map((y, i) => [
            y,
            {
              stockholdersEquity: netIncome[i] * 3,
              totalAssets: netIncome[i] * 5,
              totalDebt: 2_000_000_000,
              cash: 9_000_000_000,
            },
          ]),
        ),
        quarterly: null,
      },
      cash: {
        annual: statement('cash', [
          ['2025-12-31', { operatingCashFlow: 7_000_000_000, capitalExpenditure: -1_000_000_000 }],
        ]),
        quarterly: null,
      },
    },
    // A 60% decline from a 150 high.
    priceHistory: prices([
      ['2022-01-03', 150],
      ['2026-09-11', 60],
    ]),
    estimates: null,
    filingCurrency: 'USD',
    statementSources: { income: 'test', balance: 'test', cash: 'test' },
    estimatesSource: null,
    isStale: false,
    staleAsOf: null,
    errors: [],
    ...overrides,
  };
}

function run(
  bundle: SymbolBundle,
  options: { isFinancial?: boolean; isPaymentProcessor?: boolean } = {},
): { signal: SignalResult; ratios: Record<RatioKey, RatioResult> } {
  const ctx = buildContext(bundle, {
    focusSector: 'information_technology',
    ...options,
  });
  const lynch = classifyLynch(ctx);
  const ratios = computeAllRatios(ctx, lynch.category === 'average_growth' ? 'average_growth' : 'high_growth');
  const signal = evaluateSignal(ctx, ratios, lynch.category);
  return { signal, ratios };
}

// ---------------------------------------------------------------------------
// Status rules
// ---------------------------------------------------------------------------

describe('status rules (section 7)', () => {
  it('returns buy_worthy when every applicable condition passes', () => {
    const { signal } = run(idealBundle());

    expect(signal.status).toBe('buy_worthy');
    expect(signal.conditionsMet).toBe(signal.conditionsApplicable);
    expect(signal.missing).toHaveLength(0);
  });

  it('returns almost when the gate holds and one quality check is missing', () => {
    // Shallower decline: condition 4 fails, everything else still passes.
    const bundle = idealBundle({
      priceHistory: prices([
        ['2022-01-03', 150],
        ['2026-09-11', 105],
      ]),
      quote: { ...idealBundle().quote!, price: 105 },
    });
    const { signal } = run(bundle);

    expect(signal.status).toBe('almost');
    expect(signal.missing).toContain('drawdown');
  });

  it('returns watching when the gate itself fails', () => {
    const bundle = idealBundle({
      quote: { ...idealBundle().quote!, marketCap: 2_000_000_000 },
    });
    const { signal } = run(bundle);

    expect(signal.status).toBe('watching');
    expect(signal.missing).toContain('market_cap');
  });
});

// ---------------------------------------------------------------------------
// Applicable-condition denominator
// ---------------------------------------------------------------------------

describe('applicable-condition denominator', () => {
  it('scores an ordinary company out of all nine', () => {
    const { signal } = run(idealBundle());
    expect(signal.conditionsApplicable).toBe(9);
  });

  /**
   * Banks and insurers have no meaningful free cash flow or debt ratio.
   * Scoring them out of a fixed nine would mark them down for checks that
   * cannot apply, which is the bug this denominator exists to prevent.
   */
  it('drops inapplicable conditions from the denominator for a financial institution', () => {
    const { signal } = run(idealBundle(), { isFinancial: true });

    expect(signal.conditionsApplicable).toBe(7);
    const inapplicable = signal.conditions.filter((c) => !c.applicable).map((c) => c.key);
    expect(inapplicable).toEqual(['cash_flow', 'debt']);

    // And the dropped conditions never count as failures.
    expect(signal.missing).not.toContain('cash_flow');
    expect(signal.missing).not.toContain('debt');
  });

  it('never lets conditionsMet exceed conditionsApplicable', () => {
    for (const options of [{}, { isFinancial: true }, { isPaymentProcessor: true }]) {
      const { signal } = run(idealBundle(), options);
      expect(signal.conditionsMet).toBeLessThanOrEqual(signal.conditionsApplicable);
    }
  });
});

// ---------------------------------------------------------------------------
// Payment processors
// ---------------------------------------------------------------------------

describe('payment processors', () => {
  it('marks the inventory/receivables card not applicable', () => {
    const { ratios } = run(idealBundle(), { isPaymentProcessor: true });

    expect(ratios.inventory_receivables.color).toBe('gray');
    expect(ratios.inventory_receivables.notApplicable).toBe(true);
    expect(ratios.inventory_receivables.detail.reason).toBe('settlement_balances');
  });

  it('adjusts ROA by removing settlement float and keeps the raw figure visible', () => {
    const { ratios } = run(idealBundle(), { isPaymentProcessor: true });
    const detail = ratios.roa.detail as {
      isAdjusted?: boolean;
      rawValue?: number | null;
      adjustedValue?: number | null;
      settlementBasis?: string;
    };

    expect(detail.isAdjusted).toBe(true);
    expect(detail.rawValue).not.toBeNull();
    // Removing assets can only raise the return on what is left.
    expect(detail.adjustedValue!).toBeGreaterThan(detail.rawValue!);
    expect(ratios.roa.value).toBe(detail.adjustedValue);
  });

  it('prefers a reported restricted-cash line over the excess-cash proxy', () => {
    const base = idealBundle();
    const withRestricted = idealBundle({
      statements: {
        ...base.statements,
        balance: {
          annual: statement('balance', [
            [
              '2025-12-31',
              {
                stockholdersEquity: 17_100_000_000,
                totalAssets: 28_500_000_000,
                totalDebt: 2_000_000_000,
                cash: 9_000_000_000,
                restrictedCash: 6_000_000_000,
              },
            ],
          ]),
          quarterly: null,
        },
      },
    });

    const { ratios } = run(withRestricted, { isPaymentProcessor: true });
    const detail = ratios.roa.detail as { settlementBasis?: string; isApproximation?: boolean };

    expect(detail.settlementBasis).toBe('reported');
    expect(detail.isApproximation).toBe(false);
  });

  it('labels the proxy as an approximation when no line item exists', () => {
    const { ratios } = run(idealBundle(), { isPaymentProcessor: true });
    const detail = ratios.roa.detail as { settlementBasis?: string; isApproximation?: boolean };

    expect(detail.settlementBasis).toBe('excess_cash_proxy');
    expect(detail.isApproximation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PEG: trailing OR forward
// ---------------------------------------------------------------------------

describe('PEG condition (trailing or forward)', () => {
  const withEstimates = (nextYearEps: number) =>
    idealBundle({
      // Expensive enough that the trailing PEG fails on its own.
      quote: { ...idealBundle().quote!, price: 190 },
      priceHistory: prices([
        ['2022-01-03', 500],
        ['2026-09-11', 190],
      ]),
      estimates: {
        symbol: 'TEST',
        nextYearEps,
        nextYearEpsGrowth: null,
        nextYearRevenueGrowth: null,
        analystCount: 30,
        targetPrice: null,
        series: [{ fiscalYearEnd: '2026-12-31', eps: nextYearEps, revenue: null, analystCount: 30 }],
      },
      estimatesSource: 'yahoo-finance2',
    });

  it('passes on the forward PEG when the trailing one fails, and records the basis', () => {
    // Trailing EPS 5.7 -> forward 9.5 is ~67% growth, so forward PEG is small.
    const { signal } = run(withEstimates(9.5));
    const peg = signal.conditions.find((c) => c.key === 'peg')!;

    expect(peg.detail.trailingPasses).toBe(false);
    expect(peg.detail.forwardPasses).toBe(true);
    expect(peg.passed).toBe(true);
    expect(signal.pegBasis).toBe('forward');
    expect(signal.reliesOnForwardPeg).toBe(true);
  });

  it('records basis "none" when neither variant clears the threshold', () => {
    const { signal } = run(withEstimates(5.8));
    const peg = signal.conditions.find((c) => c.key === 'peg')!;

    expect(peg.passed).toBe(false);
    expect(signal.pegBasis).toBe('none');
    expect(signal.reliesOnForwardPeg).toBe(false);
  });

  /**
   * The case the trailing-or-forward rule was written for: reported earnings
   * are falling, so there is no trailing PEG at all. The condition used to be
   * unable to see these at all, because the engine returned before it computed
   * the forward figure.
   */
  it('passes on the forward PEG when there is no trailing PEG at all', () => {
    const base = idealBundle();
    const declining = [5.7, 5.2, 4.6, 4.0, 3.5];
    const bundle: SymbolBundle = {
      ...base,
      statements: {
        ...base.statements,
        income: {
          ...base.statements.income,
          annual: statement(
            'income',
            ['2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31', '2025-12-31'].map((y, i) => [
              y,
              {
                dilutedEps: declining[i],
                netIncome: declining[i] * 1_000_000_000,
                revenue: declining[i] * 3_000_000_000,
                grossProfit: declining[i] * 2_200_000_000,
                ebit: declining[i] * 1_300_000_000,
                ebitda: declining[i] * 1_500_000_000,
              },
            ]),
          ),
        },
      },
      estimates: {
        symbol: 'TEST',
        nextYearEps: 5.25,
        nextYearEpsGrowth: null,
        nextYearRevenueGrowth: null,
        analystCount: 30,
        targetPrice: null,
        series: [],
      },
      estimatesSource: 'yahoo-finance2',
    };

    const { signal, ratios } = run(bundle);
    const peg = signal.conditions.find((c) => c.key === 'peg')!;

    expect(ratios.peg.value).toBeNull();
    expect(ratios.peg.unavailableReason).toBe('negative_growth');
    expect(peg.detail.trailingPeg).toBeNull();
    expect(peg.detail.forwardPeg).not.toBeNull();
    expect(peg.passed).toBe(true);
    expect(signal.pegBasis).toBe('forward');

    // And the explanation names the cause rather than printing "unknown".
    const text = explainSignal({ symbol: 'TEST', signal, ratios });
    expect(text.en).toContain('There is no trailing PEG');
    expect(text.en).not.toContain('trailing PEG (unknown)');
    expect(text.nl).toContain('Er is geen gerealiseerde PEG');
  });

  /**
   * What a suggestion says about a company whose earnings are falling.
   *
   * The scan runs with `skipEstimates`, so there is no forward figure to fall
   * back on and the PEG is simply absent — which the feed used to render as
   * "No data available", i.e. as though the app had failed to fetch something.
   * Every figure was there; the earnings had shrunk, and that is a finding, not
   * a gap.
   */
  it('tells a suggestion why a shrinking company has no PEG, with no estimates to lean on', () => {
    const base = idealBundle();
    const declining = [5.7, 5.2, 4.6, 4.0, 3.5];
    const bundle: SymbolBundle = {
      ...base,
      statements: {
        ...base.statements,
        income: {
          ...base.statements.income,
          annual: statement(
            'income',
            ['2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31', '2025-12-31'].map((y, i) => [
              y,
              { dilutedEps: declining[i], netIncome: declining[i] * 1_000_000_000, revenue: declining[i] * 3_000_000_000 },
            ]),
          ),
        },
      },
      // As the scan fetches them: skipEstimates leaves this null.
      estimates: null,
      estimatesSource: null,
    };

    const { signal, ratios } = run(bundle);
    const text = explainSignal({ symbol: 'TEST', name: 'Test Co', signal, ratios });

    expect(ratios.peg.unavailableReason).toBe('negative_growth');
    expect(text.en).toContain('There is no PEG ratio on either basis');
    expect(text.en).toContain('have not grown over the window');
    expect(text.nl).toContain('niet gegroeid');
    // Not the generic gap wording, in either language.
    expect(text.en).not.toContain('unknown');
    expect(text.nl).not.toContain('onbekend');
  });

  it('records basis "trailing" when there are no estimates at all', () => {
    const { signal } = run(idealBundle());
    expect(['trailing', 'both']).toContain(signal.pegBasis);
    expect(signal.reliesOnForwardPeg).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Why-text generator
// ---------------------------------------------------------------------------

describe('why-text generator (section 7)', () => {
  /**
   * The invariant that protects the email and the suggestion cards: the page
   * gets the sentences grouped, but joining them in order must reproduce the
   * prose those two surfaces have always sent, to the character.
   */
  it('joins its sections back into exactly the prose', () => {
    const { signal, ratios } = run(idealBundle());
    const input = { symbol: 'TEST', name: 'Test Co', signal, ratios };

    const prose = explainSignal(input);
    const sections = explainSections(input);

    expect(sections.en.map((p) => p.text).join(' ')).toBe(prose.en);
    expect(sections.nl.map((p) => p.text).join(' ')).toBe(prose.nl);
  });

  it('opens with a verdict and files every sentence somewhere', () => {
    const { signal, ratios } = run(idealBundle());
    const sections = explainSections({ symbol: 'TEST', signal, ratios });

    expect(sections.en[0].section).toBe('verdict');
    for (const part of sections.en) {
      expect(['verdict', 'passes', 'missing', 'check']).toContain(part.section);
      expect(part.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('produces both languages, always together', () => {
    const { signal, ratios } = run(idealBundle());
    const text = explainSignal({ symbol: 'TEST', name: 'Test Co', signal, ratios });

    expect(text.en.length).toBeGreaterThan(80);
    expect(text.nl.length).toBeGreaterThan(80);
    expect(text.en).not.toBe(text.nl);
  });

  /** The explanation must cite the computed values, not a static sentence. */
  it('cites the actual computed drawdown and its recovery figure', () => {
    const { signal, ratios } = run(idealBundle());
    const text = explainSignal({ symbol: 'TEST', signal, ratios });

    const decline = Math.round(-ratios.drawdown_5y.value! * 100);
    const recovery = Math.round(
      (ratios.drawdown_5y.detail as { recoveryNeeded: number }).recoveryNeeded * 100,
    );

    expect(text.en).toContain(`${decline}%`);
    expect(text.en).toContain(`${recovery}%`);
    expect(text.nl).toContain(`${decline}%`);
  });

  it('says plainly when only the forward PEG carried the condition', () => {
    const bundle = idealBundle({
      quote: { ...idealBundle().quote!, price: 190 },
      priceHistory: prices([
        ['2022-01-03', 500],
        ['2026-09-11', 190],
      ]),
      estimates: {
        symbol: 'TEST',
        nextYearEps: 9.5,
        nextYearEpsGrowth: null,
        nextYearRevenueGrowth: null,
        analystCount: 30,
        targetPrice: null,
        series: [],
      },
      estimatesSource: 'yahoo-finance2',
    });
    const { signal, ratios } = run(bundle);
    const text = explainSignal({ symbol: 'TEST', signal, ratios });

    expect(signal.pegBasis).toBe('forward');
    expect(text.en).toContain('forward PEG');
    expect(text.en).toContain("hasn't shown up in reported results yet");
    // It must point at the qualitative review by name, not in passing.
    expect(text.en).toContain('My qualitative review');
    expect(text.nl).toContain('Mijn kwalitatieve beoordeling');
  });

  it('flags a deteriorating outlook when trailing passes but forward does not', () => {
    const bundle = idealBundle({
      estimates: {
        symbol: 'TEST',
        nextYearEps: 5.75, // barely any growth ahead
        nextYearEpsGrowth: null,
        nextYearRevenueGrowth: null,
        analystCount: 20,
        targetPrice: null,
        series: [],
      },
      estimatesSource: 'yahoo-finance2',
    });
    const { signal, ratios } = run(bundle);
    const text = explainSignal({ symbol: 'TEST', signal, ratios });

    expect(signal.pegBasis).toBe('trailing');
    expect(text.en).toContain('consensus expects growth to slow');
  });

  it('explains an adjusted ROA and shows the raw figure it replaced', () => {
    const { signal, ratios } = run(idealBundle(), { isPaymentProcessor: true });
    const text = explainSignal({ symbol: 'TEST', signal, ratios });

    expect(text.en).toContain('adjusted for settlement balances');
    expect(text.nl).toContain('settlementsaldi');
  });

  it('states what is missing for an "almost" signal', () => {
    const bundle = idealBundle({
      priceHistory: prices([
        ['2022-01-03', 150],
        ['2026-09-11', 105],
      ]),
      quote: { ...idealBundle().quote!, price: 105 },
    });
    const { signal, ratios } = run(bundle);
    const text = explainSignal({ symbol: 'TEST', signal, ratios });

    expect(signal.status).toBe('almost');
    expect(text.en).toContain('Still missing');
    expect(text.en).toContain('decline from the 5-year high');
    expect(text.nl).toContain('Nog niet in orde');
  });

  it('reuses the same generator for the email body', () => {
    const { signal, ratios } = run(idealBundle());
    const input = { symbol: 'TEST', name: 'Test Co', signal, ratios };
    const email = explainForEmail(input, 'en');

    // The email body must contain the explanation verbatim, not separate copy.
    expect(email.body).toContain(explainSignal(input).en);
    expect(email.subject).toContain('TEST');
  });
});

// ---------------------------------------------------------------------------
// Lynch classification
// ---------------------------------------------------------------------------

describe('Lynch classification (section 6)', () => {
  it('classifies a 23%/yr compounder as high growth', () => {
    const ctx = buildContext(idealBundle(), { focusSector: 'information_technology' });
    const result = classifyLynch(ctx, { industry: 'Software' });

    expect(result.category).toBe('high_growth');
    expect(result.outsideFocus).toBe(false);
  });

  it('classifies a bank as a financial institution and outside the focus', () => {
    const ctx = buildContext(idealBundle(), { isFinancial: true });
    expect(classifyLynch(ctx).category).toBe('financial_institution');
    expect(classifyLynch(ctx).outsideFocus).toBe(true);
  });

  it('classifies repeated losses as a turnaround', () => {
    const bundle = idealBundle();
    bundle.statements.income.annual = statement('income', [
      ['2023-12-31', { netIncome: -500, dilutedEps: -0.5 }],
      ['2024-12-31', { netIncome: -200, dilutedEps: -0.2 }],
      ['2025-12-31', { netIncome: 100, dilutedEps: 0.1 }],
    ]);
    const ctx = buildContext(bundle);

    expect(classifyLynch(ctx).category).toBe('turnaround');
  });

  it('needs both a volatile record and a cyclical industry to call something cyclical', () => {
    const bundle = idealBundle();
    bundle.statements.income.annual = statement('income', [
      ['2021-12-31', { netIncome: 1000, dilutedEps: 1 }],
      ['2022-12-31', { netIncome: 2500, dilutedEps: 2.5 }],
      ['2023-12-31', { netIncome: 900, dilutedEps: 0.9 }],
      ['2024-12-31', { netIncome: 2800, dilutedEps: 2.8 }],
      ['2025-12-31', { netIncome: 1200, dilutedEps: 1.2 }],
    ]);
    const ctx = buildContext(bundle);

    expect(classifyLynch(ctx, { industry: 'Automobiles' }).category).toBe('cyclical');
    // Same volatility, non-cyclical industry: not a cyclical.
    expect(classifyLynch(ctx, { industry: 'Software' }).category).not.toBe('cyclical');
  });
});

describe('adjusted ROA is bounded by equity', () => {
  /**
   * The excess-cash proxy, unbounded, stripped almost the whole balance sheet
   * and put Adyen's ROA at 261% — which flipped it to buy-worthy on a
   * fabricated number. Settlement float is liability-funded, so the deduction
   * can never eat into equity-funded assets.
   */
  it('never deducts below shareholders equity, so ROA cannot exceed ROE', () => {
    // Assets dominated by float: 12bn of assets on 5.9bn of equity, 11bn cash.
    const base = idealBundle();
    const bundle = idealBundle({
      statements: {
        ...base.statements,
        balance: {
          annual: statement('balance', [
            ['2024-12-31', { stockholdersEquity: 5_400_000_000, totalAssets: 11_400_000_000, cash: 10_500_000_000, totalDebt: 400_000_000 }],
            ['2025-12-31', { stockholdersEquity: 5_910_000_000, totalAssets: 12_260_000_000, cash: 11_430_000_000, totalDebt: 400_000_000 }],
          ]),
          quarterly: null,
        },
      },
    });

    const { ratios } = run(bundle, { isPaymentProcessor: true });
    const detail = ratios.roa.detail as {
      equityFloorApplied?: boolean;
      adjustedAssets?: number;
    };

    expect(detail.equityFloorApplied).toBe(true);
    expect(detail.adjustedAssets).toBe(5_910_000_000);
    expect(ratios.roa.value!).toBeLessThan(ratios.roe.value!);
    // Sanity: a plausible figure, not a runaway one.
    expect(ratios.roa.value!).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Standing invariants — run against every fixture, not just the case that broke
// ---------------------------------------------------------------------------

describe('standing invariants', () => {
  const scenarios: Array<[string, SymbolBundle, { isFinancial?: boolean; isPaymentProcessor?: boolean }]> = [
    ['ordinary company', idealBundle(), {}],
    ['payment processor', idealBundle(), { isPaymentProcessor: true }],
    ['financial institution', idealBundle(), { isFinancial: true }],
    [
      'float-heavy balance sheet',
      idealBundle({
        statements: {
          ...idealBundle().statements,
          balance: {
            annual: statement('balance', [
              ['2024-12-31', { stockholdersEquity: 5_400_000_000, totalAssets: 11_400_000_000, cash: 10_500_000_000, totalDebt: 400_000_000 }],
              ['2025-12-31', { stockholdersEquity: 5_910_000_000, totalAssets: 12_260_000_000, cash: 11_430_000_000, totalDebt: 400_000_000 }],
            ]),
            quarterly: null,
          },
        },
      }),
      { isPaymentProcessor: true },
    ],
    [
      'cross-listed, no FX rate available',
      idealBundle({ filingCurrency: 'EUR' }),
      {},
    ],
  ];

  for (const [name, bundle, options] of scenarios) {
    it(`holds for ${name}`, () => {
      const ctx = buildContext(bundle, { focusSector: 'information_technology', ...options });
      const lynch = classifyLynch(ctx);
      const ratios = computeAllRatios(ctx, 'high_growth');
      const violations = checkInvariants(ctx, ratios);

      expect(
        violations.map((v) => `${v.rule}: ${v.message}`),
      ).toEqual([]);
      expect(lynch.category).toBeTruthy();
    });
  }

  it('catches an ROA above ROE when one slips through', () => {
    // Hand-built impossible pair, to prove the check fires rather than assuming.
    const ctx = buildContext(idealBundle(), { focusSector: 'information_technology' });
    const ratios = computeAllRatios(ctx, 'high_growth');
    const broken = {
      ...ratios,
      roa: { ...ratios.roa, value: 2.61 },
      roe: { ...ratios.roe, value: 0.22 },
    };

    const violations = checkInvariants(ctx, broken);
    expect(violations.map((v) => v.rule)).toContain('roa_not_above_roe');
    expect(violations.map((v) => v.rule)).toContain('roa_implausible');
  });
});

// ---------------------------------------------------------------------------
// Semiconductors are not cyclicals
// ---------------------------------------------------------------------------

describe('semiconductors are not classified as cyclical', () => {
  /**
   * The book names microchips and chip equipment as its best-performing
   * subsector, and Nvidia, AMD, Broadcom and Applied Materials as the companies
   * behind it. Their earnings are genuinely volatile, but volatility alone does
   * not make a classic cyclical.
   */
  const volatile = () => {
    const bundle = idealBundle();
    bundle.statements.income.annual = statement('income', [
      ['2021-12-31', { netIncome: 1_000_000_000, dilutedEps: 1, revenue: 3_000_000_000 }],
      ['2022-12-31', { netIncome: 2_500_000_000, dilutedEps: 2.5, revenue: 5_000_000_000 }],
      ['2023-12-31', { netIncome: 1_400_000_000, dilutedEps: 1.4, revenue: 4_000_000_000 }],
      ['2024-12-31', { netIncome: 3_600_000_000, dilutedEps: 3.6, revenue: 7_000_000_000 }],
      ['2025-12-31', { netIncome: 5_000_000_000, dilutedEps: 5, revenue: 9_000_000_000 }],
    ]);
    return bundle;
  };

  it('classifies a volatile semiconductor company by its growth, not as cyclical', () => {
    const ctx = buildContext(volatile(), { focusSector: 'information_technology' });
    const result = classifyLynch(ctx, { industry: 'Semiconductors & Semiconductor Equipment' });

    expect(result.category).not.toBe('cyclical');
    expect(['high_growth', 'average_growth']).toContain(result.category);
    expect(result.outsideFocus).toBe(false);
  });

  it('still classifies an equally volatile carmaker as cyclical', () => {
    const ctx = buildContext(volatile(), { focusSector: 'outside_focus' });
    expect(classifyLynch(ctx, { industry: 'Automobiles' }).category).toBe('cyclical');
  });
});

// ---------------------------------------------------------------------------
// EPS gaps
// ---------------------------------------------------------------------------

describe('growth measurement when EPS history is incomplete', () => {
  it('uses the longest consecutive EPS run when a year is missing at an endpoint', () => {
    const bundle = idealBundle();
    bundle.statements.income.annual = statement('income', [
      ['2019-12-31', { netIncome: 900_000_000, dilutedEps: 0.9, revenue: 3_000_000_000 }],
      // 2020 and 2021 missing entirely
      ['2022-12-31', { netIncome: 2_000_000_000, dilutedEps: 2, revenue: 5_000_000_000 }],
      ['2023-12-31', { netIncome: 2_600_000_000, dilutedEps: 2.6, revenue: 6_000_000_000 }],
      ['2024-12-31', { netIncome: 3_300_000_000, dilutedEps: 3.3, revenue: 7_000_000_000 }],
      ['2025-12-31', { netIncome: 4_200_000_000, dilutedEps: 4.2, revenue: 8_000_000_000 }],
    ]);
    const ctx = buildContext(bundle, { focusSector: 'information_technology' });
    const result = classifyLynch(ctx, { industry: 'Software' });

    expect(result.epsCagr).not.toBeNull();
    expect(result.category).not.toBe('unknown');
  });

  it('falls back to revenue growth, labelled, when EPS is absent entirely', () => {
    const bundle = idealBundle();
    bundle.statements.income.annual = statement('income', [
      ['2021-12-31', { netIncome: 1_000_000_000, revenue: 3_000_000_000 }],
      ['2022-12-31', { netIncome: 1_300_000_000, revenue: 3_900_000_000 }],
      ['2023-12-31', { netIncome: 1_700_000_000, revenue: 5_000_000_000 }],
      ['2024-12-31', { netIncome: 2_200_000_000, revenue: 6_400_000_000 }],
      ['2025-12-31', { netIncome: 2_900_000_000, revenue: 8_200_000_000 }],
    ]);
    const ctx = buildContext(bundle, { focusSector: 'information_technology' });
    const result = classifyLynch(ctx, { industry: 'Software' });

    expect(result.growthBasis).toBe('revenue');
    expect(result.basisNoteKey).toBe('lynch.basis_revenue');
    expect(result.category).not.toBe('unknown');
  });

  it('stays unknown when there is nothing to measure', () => {
    const bundle = idealBundle();
    bundle.statements.income.annual = statement('income', [
      ['2025-12-31', { netIncome: 1_000_000_000 }],
    ]);
    const ctx = buildContext(bundle, { focusSector: 'information_technology' });
    const result = classifyLynch(ctx, { industry: 'Software' });

    expect(result.category).toBe('unknown');
    expect(result.growthBasis).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// Lynch band tolerance
// ---------------------------------------------------------------------------

describe('Lynch band tolerance (±1pp, resolving upward)', () => {
  /**
   * Builds a series whose least-squares growth lands on a target rate, so the
   * boundary cases can be tested directly rather than hunted for.
   */
  const atRate = (rate: number) => {
    const bundle = idealBundle();
    const base = 1;
    const years = [0, 1, 2, 3, 4, 5];
    bundle.statements.income.annual = statement(
      'income',
      years.map((i) => {
        const eps = base * (1 + rate) ** i;
        return [
          `${2020 + i}-12-31`,
          { dilutedEps: eps, netIncome: eps * 1e9, revenue: eps * 3e9 },
        ] as [string, Record<string, number>];
      }),
    );
    return bundle;
  };

  const categoryAt = (rate: number) => {
    const ctx = buildContext(atRate(rate), { focusSector: 'information_technology' });
    return classifyLynch(ctx, { industry: 'Software' });
  };

  it('lifts 19.0–19.9% into high growth, so the PEG ceiling stays 1.0', () => {
    for (const rate of [0.19, 0.195, 0.199]) {
      const result = categoryAt(rate);
      expect(result.category).toBe('high_growth');
      expect(result.resolvedUpByTolerance).toBe(true);
    }
  });

  it('lifts 9.0–9.9% into average growth', () => {
    for (const rate of [0.09, 0.095, 0.099]) {
      const result = categoryAt(rate);
      expect(result.category).toBe('average_growth');
      expect(result.resolvedUpByTolerance).toBe(true);
    }
  });

  it('does not flag a rate that clears the band on its own merits', () => {
    const result = categoryAt(0.24);
    expect(result.category).toBe('high_growth');
    expect(result.resolvedUpByTolerance).toBe(false);
  });

  it('still excludes a rate below the tolerance zone', () => {
    expect(categoryAt(0.185).category).toBe('average_growth');
    expect(categoryAt(0.085).category).toBe('low_growth');
  });

  it('carries the widened category through to the PEG threshold', () => {
    const ctx = buildContext(atRate(0.199), { focusSector: 'information_technology' });
    const lynch = classifyLynch(ctx, { industry: 'Software' });
    const ratios = computeAllRatios(ctx, pegCategoryFor(lynch.category));

    // 1.0, not the 0.7 an unaided 19.9% would have been held to.
    expect(ratios.peg.thresholds).toMatchObject({ threshold: 1 });
  });
});
