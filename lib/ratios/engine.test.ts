/**
 * Ratio-engine tests.
 *
 * Fixtures are hand-built rather than fetched, so each case states exactly the
 * figures it is about. Several cases encode bugs found against real data —
 * ASML's currency mismatch and Adyen's reporting break — so a regression fails
 * here rather than in a buy signal.
 */
import { describe, expect, it } from 'vitest';
import {
  buildContext,
  computeAllRatios,
  computeDebt,
  computeDrawdown,
  computeEarningsQuality,
  computeEvEbit,
  computeGrossMargin,
  computeInventoryReceivables,
  computeMarketCap,
  computePFcf,
  computePayoutRatio,
  computePe,
  computePeg,
  computeRoe,
  derive,
} from './engine';
import { detectSeriesBreak, afterLastBreak, cagr, drawdownFromHigh, sumTtm, trendGrowth } from './fundamentals';
import { createFxRates } from '@/lib/providers/fx';
import type {
  FinancialStatement,
  MetricName,
  PricePoint,
  StatementFrequency,
  StatementKind,
} from '@/lib/providers/types';
import type { SymbolBundle } from '@/lib/providers/marketData';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function statement(
  kind: StatementKind,
  frequency: StatementFrequency,
  periods: Array<[string, Partial<Record<MetricName, number>>]>,
  currency?: string,
): FinancialStatement {
  return {
    symbol: 'TEST',
    kind,
    frequency,
    currency,
    periods: periods
      .map(([endDate, metrics]) => ({ endDate, metrics }))
      .sort((a, b) => b.endDate.localeCompare(a.endDate)),
  };
}

interface BundleOptions {
  price?: number | null;
  marketCap?: number | null;
  quoteCurrency?: string;
  filingCurrency?: string;
  dividendPerShare?: number | null;
  income?: FinancialStatement | null;
  incomeQuarterly?: FinancialStatement | null;
  balance?: FinancialStatement | null;
  cash?: FinancialStatement | null;
  priceHistory?: PricePoint[];
  estimates?: SymbolBundle['estimates'];
}

function bundle(options: BundleOptions = {}): SymbolBundle {
  return {
    symbol: 'TEST',
    asOf: '2026-09-13',
    quote: {
      symbol: 'TEST',
      name: 'Test Co',
      price: options.price ?? 100,
      currency: options.quoteCurrency ?? 'USD',
      marketCap: options.marketCap ?? 100_000_000_000,
      previousClose: null,
      open: null,
      dayHigh: null,
      dayLow: null,
      volume: null,
      exchange: null,
      sector: null,
      industry: null,
      nextEarningsDate: null,
      beta: null,
      dividendPerShare: options.dividendPerShare ?? null,
      employees: null,
      description: null,
    },
    statements: {
      income: { annual: options.income ?? null, quarterly: options.incomeQuarterly ?? null },
      balance: { annual: options.balance ?? null, quarterly: null },
      cash: { annual: options.cash ?? null, quarterly: null },
    },
    priceHistory: options.priceHistory ?? [],
    estimates: options.estimates ?? null,
    filingCurrency: options.filingCurrency ?? options.quoteCurrency ?? 'USD',
    statementSources: { income: 'test', balance: 'test', cash: 'test' },
    estimatesSource: null,
    isStale: false,
    staleAsOf: null,
    errors: [],
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

// ---------------------------------------------------------------------------
// 5.1 P/E and currency conversion
// ---------------------------------------------------------------------------

describe('P/E (5.1)', () => {
  const income = statement('income', 'annual', [['2025-12-31', { dilutedEps: 5 }]]);

  it('divides price by trailing EPS and colours against the book ceiling of 30', () => {
    const ctx = buildContext(bundle({ price: 120, income }));
    const result = computePe(ctx, derive(ctx));

    expect(result.value).toBeCloseTo(24, 6);
    expect(result.color).toBe('green');
    expect(result.targetSource).toBe('book');
  });

  it('is orange between 30 and 40, red above', () => {
    const orange = buildContext(bundle({ price: 175, income }));
    const red = buildContext(bundle({ price: 250, income }));

    expect(computePe(orange, derive(orange)).color).toBe('orange');
    expect(computePe(red, derive(red)).color).toBe('red');
  });

  it('withholds a P/E built on a loss rather than reporting a negative one', () => {
    const loss = statement('income', 'annual', [['2025-12-31', { dilutedEps: -2 }]]);
    const ctx = buildContext(bundle({ price: 100, income: loss }));
    const result = computePe(ctx, derive(ctx));

    expect(result.value).toBeNull();
    expect(result.unavailableReason).toBe('negative_base');
  });

  /**
   * The ASML case: quoted in USD on NasdaqGS, reporting in EUR. Without
   * conversion this returned 61.6 against Yahoo's 57.5.
   */
  it('converts the price into the filing currency before dividing', () => {
    const fx = createFxRates({ USDEUR: 1 / 1.16 });
    const ctx = buildContext(
      bundle({ price: 1698.3, quoteCurrency: 'USD', filingCurrency: 'EUR', income: statement('income', 'annual', [['2025-12-31', { dilutedEps: 27.55 }]]) }),
      { fx },
    );
    const result = computePe(ctx, derive(ctx));

    // 1698.30 USD -> 1464 EUR, against EUR 27.55 of earnings.
    expect(result.value).toBeCloseTo(1698.3 / 1.16 / 27.55, 4);
    expect(result.detail.currencyConverted).toBe(true);

    // The unconverted figure is the bug this guards against.
    expect(result.value).not.toBeCloseTo(1698.3 / 27.55, 1);
  });

  it('withholds price ratios entirely when no exchange rate is available', () => {
    const ctx = buildContext(
      bundle({ price: 100, quoteCurrency: 'USD', filingCurrency: 'EUR', income }),
      { fx: createFxRates() },
    );
    const result = computePe(ctx, derive(ctx));

    expect(result.value).toBeNull();
    expect(result.unavailableReason).toBe('no_fx_rate');
  });
});

// ---------------------------------------------------------------------------
// 5.2 PEG and the Adyen reporting break
// ---------------------------------------------------------------------------

describe('PEG (5.2)', () => {
  const growingEps = statement('income', 'annual', [
    ['2021-12-31', { dilutedEps: 2 }],
    ['2022-12-31', { dilutedEps: 2.5 }],
    ['2023-12-31', { dilutedEps: 3.1 }],
    ['2024-12-31', { dilutedEps: 3.9 }],
    ['2025-12-31', { dilutedEps: 4.9 }],
  ]);

  it('applies the high-growth threshold of 1.0', () => {
    const ctx = buildContext(bundle({ price: 100, income: growingEps }));
    const d = derive(ctx);
    const result = computePeg(ctx, d, 'high_growth', computePe(ctx, d));

    expect(result.thresholds).toMatchObject({ threshold: 1 });
    expect(result.value).toBeGreaterThan(0);
  });

  it('gets stricter for slower growers, per the book’s three thresholds', () => {
    const ctx = buildContext(bundle({ price: 100, income: growingEps }));
    const d = derive(ctx);
    const pe = computePe(ctx, d);

    expect(computePeg(ctx, d, 'average_growth', pe).thresholds).toMatchObject({ threshold: 0.7 });
    expect(computePeg(ctx, d, 'low_growth', pe).thresholds).toMatchObject({ threshold: 0.5 });
  });

  /**
   * Adyen restated revenue from gross to net in 2023 (EUR 8.94bn -> 1.86bn).
   * A CAGR across that step reads about -33%/yr against real growth near +20%.
   */
  it('suppresses growth across a reporting-basis break instead of reporting it', () => {
    const broken = statement('income', 'annual', [
      ['2022-12-31', { dilutedEps: 30, revenue: 8_940_000_000 }],
      ['2023-12-31', { dilutedEps: 6, revenue: 1_860_000_000 }],
      ['2024-12-31', { dilutedEps: 7.5, revenue: 2_230_000_000 }],
      ['2025-12-31', { dilutedEps: 9, revenue: 2_650_000_000 }],
    ]);
    const ctx = buildContext(bundle({ price: 900, income: broken }));
    const d = derive(ctx);

    const detected = detectSeriesBreak(d.revenueSeries);
    expect(detected.hasBreak).toBe(true);
    expect(detected.at).toBe('2023-12-31');

    // Only the post-break years are used, so growth comes out positive.
    const usable = afterLastBreak(d.revenueSeries);
    expect(usable).toHaveLength(3);
    expect(usable[0].period).toBe('2023-12-31');

    const revenueGrowth = computeAllRatios(ctx, 'high_growth').revenue_growth;
    expect(revenueGrowth.value).toBeGreaterThan(0);
    expect(revenueGrowth.detail.seriesBreak).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5.3 / 5.4 EV/EBIT and P/FCF
// ---------------------------------------------------------------------------

describe('EV/EBIT (5.3) and P/FCF (5.4)', () => {
  const balance = statement('balance', 'annual', [
    ['2025-12-31', { totalDebt: 20_000_000_000, cash: 5_000_000_000 }],
  ]);
  const income = statement('income', 'annual', [['2025-12-31', { ebit: 10_000_000_000 }]]);

  it('adds debt and subtracts cash before dividing by EBIT', () => {
    const ctx = buildContext(bundle({ marketCap: 100_000_000_000, income, balance }));
    const result = computeEvEbit(ctx, derive(ctx));

    // (100 + 20 - 5) / 10
    expect(result.value).toBeCloseTo(11.5, 6);
    expect(result.color).toBe('green');
  });

  it('is not applicable to banks and insurers', () => {
    const ctx = buildContext(bundle({ income, balance }), { isFinancial: true });
    const result = computeEvEbit(ctx, derive(ctx));

    expect(result.color).toBe('gray');
    expect(result.notApplicable).toBe(true);
  });

  it('marks negative free cash flow red rather than missing', () => {
    const cash = statement('cash', 'annual', [
      ['2025-12-31', { operatingCashFlow: 1_000_000_000, capitalExpenditure: -3_000_000_000 }],
    ]);
    const ctx = buildContext(bundle({ cash }));
    const result = computePFcf(ctx, derive(ctx));

    expect(result.color).toBe('red');
    expect(result.value).toBeNull();
  });

  it('treats capex as an outflow whichever sign the source used', () => {
    const negative = statement('cash', 'annual', [
      ['2025-12-31', { operatingCashFlow: 10_000_000_000, capitalExpenditure: -4_000_000_000 }],
    ]);
    const positive = statement('cash', 'annual', [
      ['2025-12-31', { operatingCashFlow: 10_000_000_000, capitalExpenditure: 4_000_000_000 }],
    ]);

    expect(derive(buildContext(bundle({ cash: negative }))).freeCashFlow).toBe(6_000_000_000);
    expect(derive(buildContext(bundle({ cash: positive }))).freeCashFlow).toBe(6_000_000_000);
  });
});

// ---------------------------------------------------------------------------
// 5.5 Earnings quality
// ---------------------------------------------------------------------------

describe('earnings quality (5.5)', () => {
  it('is green when operating cash flow covers net income', () => {
    const ctx = buildContext(
      bundle({
        income: statement('income', 'annual', [['2025-12-31', { netIncome: 1_000 }]]),
        cash: statement('cash', 'annual', [['2025-12-31', { operatingCashFlow: 1_200 }]]),
      }),
    );
    expect(computeEarningsQuality(ctx, derive(ctx)).color).toBe('green');
  });

  it('flags negative operating cash flow against positive profit as red', () => {
    const ctx = buildContext(
      bundle({
        income: statement('income', 'annual', [['2025-12-31', { netIncome: 1_000 }]]),
        cash: statement('cash', 'annual', [['2025-12-31', { operatingCashFlow: -500 }]]),
      }),
    );
    const result = computeEarningsQuality(ctx, derive(ctx));

    expect(result.color).toBe('red');
    expect(result.detail.redFlag).toBe('negative_ocf');
  });
});

// ---------------------------------------------------------------------------
// 5.6 ROE consistency
// ---------------------------------------------------------------------------

describe('ROE (5.6)', () => {
  const equity = (values: number[]) =>
    statement(
      'balance',
      'annual',
      values.map((v, i) => [`${2021 + i}-12-31`, { stockholdersEquity: v }] as const),
    );
  const profit = (values: number[]) =>
    statement(
      'income',
      'annual',
      values.map((v, i) => [`${2021 + i}-12-31`, { netIncome: v }] as const),
    );

  it('is green only when the 15% bar is cleared consistently, not once', () => {
    const ctx = buildContext(
      bundle({
        income: profit([200, 210, 220, 230, 240]),
        balance: equity([1000, 1000, 1000, 1000, 1000]),
      }),
    );
    const result = computeRoe(ctx);

    expect(result.value).toBeCloseTo(0.24, 4);
    expect(result.color).toBe('green');
    expect(result.detail.qualifyingYears).toBe(5);
  });

  it('is not green when only the latest year clears the bar', () => {
    const ctx = buildContext(
      bundle({
        income: profit([50, 50, 50, 50, 240]),
        balance: equity([1000, 1000, 1000, 1000, 1000]),
      }),
    );
    const result = computeRoe(ctx);

    expect(result.detail.qualifyingYears).toBe(1);
    expect(result.color).not.toBe('green');
  });
});

// ---------------------------------------------------------------------------
// 5.10 Gross margin — the "or rising" clause
// ---------------------------------------------------------------------------

describe('gross margin (5.10)', () => {
  it('is green below 50% when the margin has risen every year', () => {
    const income = statement('income', 'annual', [
      ['2021-12-31', { revenue: 1000, grossProfit: 300 }],
      ['2022-12-31', { revenue: 1000, grossProfit: 320 }],
      ['2023-12-31', { revenue: 1000, grossProfit: 350 }],
      ['2024-12-31', { revenue: 1000, grossProfit: 380 }],
      ['2025-12-31', { revenue: 1000, grossProfit: 410 }],
    ]);
    const ctx = buildContext(bundle({ income }));
    const result = computeGrossMargin(ctx, derive(ctx));

    expect(result.value).toBeCloseTo(0.41, 4);
    expect(result.detail.risingEveryYear).toBe(true);
    expect(result.color).toBe('green');
  });

  it('is red on a declining margin even above the orange band', () => {
    const income = statement('income', 'annual', [
      ['2021-12-31', { revenue: 1000, grossProfit: 480 }],
      ['2022-12-31', { revenue: 1000, grossProfit: 450 }],
      ['2023-12-31', { revenue: 1000, grossProfit: 420 }],
      ['2024-12-31', { revenue: 1000, grossProfit: 400 }],
      ['2025-12-31', { revenue: 1000, grossProfit: 380 }],
    ]);
    const ctx = buildContext(bundle({ income }));
    const result = computeGrossMargin(ctx, derive(ctx));

    expect(result.detail.declining).toBe(true);
    expect(result.color).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// 5.11 Debt
// ---------------------------------------------------------------------------

describe('debt (5.11)', () => {
  it('treats a net cash position as green', () => {
    const ctx = buildContext(
      bundle({
        income: statement('income', 'annual', [['2025-12-31', { ebit: 1000, ebitda: 1200 }]]),
        balance: statement('balance', 'annual', [
          ['2025-12-31', { totalDebt: 100, cash: 900 }],
        ]),
      }),
    );
    const result = computeDebt(ctx, derive(ctx));

    expect(result.detail.netCash).toBe(true);
    expect(result.color).toBe('green');
  });

  it('is red above 2.5x net debt to EBITDA', () => {
    const ctx = buildContext(
      bundle({
        income: statement('income', 'annual', [['2025-12-31', { ebit: 1000, ebitda: 1000 }]]),
        balance: statement('balance', 'annual', [['2025-12-31', { totalDebt: 4000, cash: 0 }]]),
      }),
    );
    expect(computeDebt(ctx, derive(ctx)).color).toBe('red');
  });

  it('derives EBITDA from EBIT plus D&A when it is not reported', () => {
    const ctx = buildContext(
      bundle({
        income: statement('income', 'annual', [['2025-12-31', { ebit: 800 }]]),
        cash: statement('cash', 'annual', [
          ['2025-12-31', { depreciationAndAmortization: 200 }],
        ]),
        balance: statement('balance', 'annual', [['2025-12-31', { totalDebt: 1000, cash: 0 }]]),
      }),
    );
    expect(derive(ctx).ebitda).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// 5.13 Payout ratio
// ---------------------------------------------------------------------------

describe('payout ratio (5.13)', () => {
  it('is red at or above 90%, the book’s fragile-dividend signal', () => {
    const ctx = buildContext(
      bundle({
        income: statement('income', 'annual', [['2025-12-31', { netIncome: 1000 }]]),
        cash: statement('cash', 'annual', [['2025-12-31', { dividendsPaid: -950 }]]),
      }),
    );
    const result = computePayoutRatio(ctx, derive(ctx));

    expect(result.value).toBeCloseTo(0.95, 4);
    expect(result.color).toBe('red');
  });

  it('is green for a growth stock retaining most of its profit', () => {
    const ctx = buildContext(
      bundle({
        income: statement('income', 'annual', [['2025-12-31', { netIncome: 1000 }]]),
        cash: statement('cash', 'annual', [['2025-12-31', { dividendsPaid: -200 }]]),
      }),
    );
    expect(computePayoutRatio(ctx, derive(ctx)).color).toBe('green');
  });
});

// ---------------------------------------------------------------------------
// 5.17 Inventory and receivables
// ---------------------------------------------------------------------------

describe('inventory and receivables (5.17)', () => {
  const income = statement('income', 'annual', [
    ['2024-12-31', { revenue: 1000 }],
    ['2025-12-31', { revenue: 1100 }],
  ]);

  it('is red when inventory outgrows revenue', () => {
    const balance = statement('balance', 'annual', [
      ['2024-12-31', { inventory: 100 }],
      ['2025-12-31', { inventory: 150 }],
    ]);
    const ctx = buildContext(bundle({ income, balance }));
    const result = computeInventoryReceivables(ctx, derive(ctx));

    expect(result.detail.outpacing).toBe(true);
    expect(result.color).toBe('red');
  });

  it('is gray, never red, for a business with no inventory', () => {
    const ctx = buildContext(bundle({ income, balance: statement('balance', 'annual', []) }));
    const result = computeInventoryReceivables(ctx, derive(ctx));

    expect(result.color).toBe('gray');
    expect(result.notApplicable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5.18 Drawdown — the core signal
// ---------------------------------------------------------------------------

describe('drawdown from the 5-year high (5.18)', () => {
  it('measures the fall from the highest close and the climb back', () => {
    const history = prices([
      ['2021-09-23', 2746.5],
      ['2023-01-01', 1200],
      ['2026-09-11', 928.7],
    ]);
    const result = drawdownFromHigh(history, 928.7);

    expect(result.high).toBe(2746.5);
    expect(result.highDate).toBe('2021-09-23');
    expect(result.drawdown).toBeCloseTo(-0.6618, 3);
    // The logarithmic waterfall: a 66% fall needs a 196% gain to undo.
    expect(result.recoveryNeeded).toBeCloseTo(1.9574, 3);
  });

  /**
   * The drawdown used to be coloured green at the entry threshold, which put a
   * green -66% three pixels from red "fail" dots that meant the opposite. Green
   * and red are reserved for passed and failed now; whether the decline clears
   * the threshold is a fact in `detail`, and the card shows it as a tag.
   */
  it('stays neutral rather than borrowing the pass and fail colours', () => {
    const deep = buildContext(
      bundle({ price: 50, priceHistory: prices([['2022-01-01', 100], ['2026-01-01', 50]]) }),
    );
    const middling = buildContext(
      bundle({ price: 60, priceHistory: prices([['2022-01-01', 100], ['2026-01-01', 60]]) }),
    );
    const shallow = buildContext(
      bundle({ price: 90, priceHistory: prices([['2022-01-01', 100], ['2026-01-01', 90]]) }),
    );

    for (const ctx of [deep, middling, shallow]) {
      expect(computeDrawdown(ctx).color).toBe('gray');
    }
  });

  it('states whether the decline clears the entry threshold as a fact', () => {
    const deep = computeDrawdown(
      buildContext(bundle({ price: 50, priceHistory: prices([['2022-01-01', 100], ['2026-01-01', 50]]) })),
    ).detail as { meetsEntryThreshold: boolean; approachingEntryThreshold: boolean };
    const middling = computeDrawdown(
      buildContext(bundle({ price: 60, priceHistory: prices([['2022-01-01', 100], ['2026-01-01', 60]]) })),
    ).detail as { meetsEntryThreshold: boolean; approachingEntryThreshold: boolean };
    const shallow = computeDrawdown(
      buildContext(bundle({ price: 90, priceHistory: prices([['2022-01-01', 100], ['2026-01-01', 90]]) })),
    ).detail as { meetsEntryThreshold: boolean; approachingEntryThreshold: boolean };

    expect(deep.meetsEntryThreshold).toBe(true);
    expect(middling.meetsEntryThreshold).toBe(false);
    expect(middling.approachingEntryThreshold).toBe(true);
    expect(shallow.meetsEntryThreshold).toBe(false);
    expect(shallow.approachingEntryThreshold).toBe(false);
  });

  /** The signal reads the value, not the colour, so this must not have moved. */
  it('leaves the buy-worthy condition unaffected by the colour change', () => {
    const deep = computeDrawdown(
      buildContext(bundle({ price: 50, priceHistory: prices([['2022-01-01', 100], ['2026-01-01', 50]]) })),
    );
    expect(deep.value).not.toBeNull();
    expect(-(deep.value as number)).toBeGreaterThanOrEqual(0.5);
  });
});

// ---------------------------------------------------------------------------
// 5.19 Market cap
// ---------------------------------------------------------------------------

describe('market cap (5.19)', () => {
  it('converts to USD before testing the $10bn floor', () => {
    const fx = createFxRates({ EURUSD: 1.16 });
    const ctx = buildContext(
      bundle({ marketCap: 9_000_000_000, quoteCurrency: 'EUR', filingCurrency: 'EUR' }),
      { fx },
    );
    const result = computeMarketCap(ctx);

    // EUR 9bn is USD 10.4bn, so it clears a floor it would fail unconverted.
    expect(result.value).toBeCloseTo(10_440_000_000, 0);
    expect(result.color).toBe('green');
  });

  it('is red below the floor', () => {
    const ctx = buildContext(bundle({ marketCap: 2_000_000_000, quoteCurrency: 'USD' }));
    expect(computeMarketCap(ctx).color).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// TTM
// ---------------------------------------------------------------------------

describe('trailing twelve months', () => {
  it('sums exactly four quarters', () => {
    const quarterly = statement('income', 'quarterly', [
      ['2025-09-30', { revenue: 100 }],
      ['2025-12-31', { revenue: 110 }],
      ['2026-03-31', { revenue: 120 }],
      ['2026-06-30', { revenue: 130 }],
      ['2025-06-30', { revenue: 90 }],
    ]);
    const result = sumTtm(quarterly, 'revenue');

    expect(result.value).toBe(460);
    expect(result.basis).toBe('ttm');
    expect(result.asOf).toBe('2026-06-30');
  });

  it('refuses to guess from fewer than four quarters', () => {
    const quarterly = statement('income', 'quarterly', [
      ['2026-06-30', { revenue: 130 }],
      ['2026-03-31', { revenue: 120 }],
    ]);
    expect(sumTtm(quarterly, 'revenue').value).toBeNull();
  });

  it('falls back to the last fiscal year when no quarterly data exists', () => {
    // Every EU listing in the seed list is in this position; Adyen reports
    // semi-annually, so no provider has quarterly figures for it.
    const ctx = buildContext(
      bundle({
        income: statement('income', 'annual', [['2025-12-31', { revenue: 2_650_000_000 }]]),
      }),
    );
    const d = derive(ctx);

    expect(d.revenue.value).toBe(2_650_000_000);
    expect(d.revenue.basis).toBe('annual');
  });
});

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

describe('computeAllRatios', () => {
  it('returns every ratio key, with gray for the ones it cannot compute', () => {
    const results = computeAllRatios(buildContext(bundle()), 'high_growth');

    expect(Object.keys(results)).toHaveLength(20);
    for (const [key, result] of Object.entries(results)) {
      expect(result.key).toBe(key);
      if (result.value === null && result.color !== 'red') {
        expect(result.unavailableReason).not.toBeNull();
      }
    }
  });
});

describe('inventory and receivables — which figure is shown', () => {
  /**
   * Adyen: inventory shrank 23% while receivables grew 64% against 19% revenue
   * growth. Showing the inventory figure made a red card read like a green one.
   */
  it('reports the figure that drove the colour, not whichever came first', () => {
    const income = statement('income', 'annual', [
      ['2024-12-31', { revenue: 2_230_000_000 }],
      ['2025-12-31', { revenue: 2_650_000_000 }],
    ]);
    const balance = statement('balance', 'annual', [
      ['2024-12-31', { inventory: 100_000_000, receivables: 130_000_000 }],
      ['2025-12-31', { inventory: 77_000_000, receivables: 213_000_000 }],
    ]);
    const ctx = buildContext(bundle({ income, balance }));
    const result = computeInventoryReceivables(ctx, derive(ctx));

    expect(result.color).toBe('red');
    expect(result.detail.driver).toBe('receivables');
    expect(result.detail.receivablesOutpace).toBe(true);
    expect(result.detail.inventoryOutpaces).toBe(false);
    // The displayed value must be the receivables growth that caused the red.
    expect(result.value).toBeCloseTo(213 / 130 - 1, 4);
  });
});

describe('statement merging across providers', () => {
  /**
   * Providers date the same fiscal year differently: Apple's FY2025 ends
   * 2025-09-27 in its filing and 2025-09-30 in Yahoo's calendar. Merging on the
   * exact date gave AAPL 23 periods instead of 19, so a "5-year" window covered
   * about three real years and every CAGR came out wrong.
   */
  it('treats period ends within a fortnight as the same fiscal period', async () => {
    const { createMarketDataService } = await import('@/lib/providers/marketData');

    const makeSource = (name: string, dates: string[], metrics: Record<string, number>) => ({
      name,
      covers: async () => true,
      getStatements: async () =>
        new Map([
          [
            'TEST',
            {
              symbol: 'TEST',
              kind: 'income' as const,
              frequency: 'annual' as const,
              periods: dates.map((endDate) => ({ endDate, metrics: { ...metrics } })),
            },
          ],
        ]),
    });

    const service = createMarketDataService({
      provider: {
        name: 'stub',
        getQuotes: async () => new Map(),
        getStatements: async () => new Map(),
        getPriceHistory: async () => [],
        getNews: async () => [],
        search: async () => [],
        getAnalystEstimates: async () => null,
      },
      fundamentalsProviders: [
        // Filing dates, with net income only.
        makeSource('filings', ['2025-09-27', '2024-09-28', '2023-09-30'], { netIncome: 100 }),
        // Normalised calendar dates, three days later, carrying the EPS.
        makeSource('calendar', ['2025-09-30', '2024-09-30', '2023-09-30'], { dilutedEps: 5 }),
      ],
      skipEstimates: true,
    });

    const bundle = await service.getBundle('TEST', '1y');
    const periods = bundle.statements.income.annual!.periods;

    // Three fiscal years, not six rows.
    expect(periods).toHaveLength(3);
    // The first provider's date wins, and both metrics land on one period.
    expect(periods[0].endDate).toBe('2025-09-27');
    expect(periods[0].metrics.netIncome).toBe(100);
    expect(periods[0].metrics.dilutedEps).toBe(5);
  });
});

describe('trendGrowth — least squares over log values', () => {
  const series = (values: number[]) =>
    values.map((value, i) => ({ period: `${2021 + i}-12-31`, value }));

  /** The worked example: year 1 inflated, years 2-5 a clean recovery. */
  it('sees a recovery that the endpoint CAGR is blind to', () => {
    const s = series([150, 100, 110, 125, 140]);

    const endpoints = cagr(s);
    const trend = trendGrowth(s);

    expect(endpoints.value!).toBeLessThan(0);
    expect(trend.value!).toBeGreaterThan(0);
    expect(trend.method).toBe('lsgr');
    expect(trend.pointsUsed).toBe(5);
    // The endpoint figure stays available for comparison on the card.
    expect(trend.endpointCagr).toBeCloseTo(endpoints.value!, 6);
  });

  it('matches the endpoint CAGR on a clean exponential series', () => {
    const s = series([100, 120, 144, 172.8, 207.36]);
    const trend = trendGrowth(s);

    expect(trend.value!).toBeCloseTo(0.2, 4);
    expect(trend.endpointCagr!).toBeCloseTo(0.2, 4);
  });

  it('falls back to endpoints when too few positive points remain', () => {
    const s = series([-5, -2, 10]);
    const trend = trendGrowth(s);

    expect(trend.method).not.toBe('lsgr');
    expect(trend.pointsUsed).toBe(1);
  });

  it('handles irregular fiscal period spacing', () => {
    const s = [
      { period: '2021-01-31', value: 100 },
      { period: '2022-01-30', value: 120 },
      { period: '2023-01-29', value: 144 },
      { period: '2024-01-28', value: 172.8 },
    ];
    expect(trendGrowth(s).value!).toBeCloseTo(0.2, 2);
  });
});
