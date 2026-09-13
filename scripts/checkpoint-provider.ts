/**
 * Build-step 2 checkpoint.
 *
 * Fetches everything through the provider layer and prints the raw computed
 * ratios for ASML, META and ADYEN.AS so they can be sanity-checked against
 * Yahoo Finance before any further work is built on top.
 *
 * The ratio maths here is deliberately the plain textbook form, so what is
 * printed can be checked by hand. The tested ratio engine with colour codes and
 * the book's targets is build step 4; this script exists to prove the provider
 * layer returns correct, correctly-normalised inputs.
 *
 *   npx tsx scripts/checkpoint-provider.ts            # table
 *   npx tsx scripts/checkpoint-provider.ts --json     # full JSON
 */
import {
  annualSeries,
  averageAnnual,
  cagr,
  drawdownFromHigh,
  latestGrowth,
  ratio,
  trailingFlow,
  trailingStock,
} from '@/lib/ratios/fundamentals';
import { createMarketDataService, type SymbolBundle } from '@/lib/providers/marketData';

const SYMBOLS = ['ASML', 'META', 'ADYEN.AS'];

const pct = (v: number | null, digits = 1) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);
const num = (v: number | null, digits = 2) => (v == null ? '—' : v.toFixed(digits));
const money = (v: number | null, currency: string | null) =>
  v == null ? '—' : `${currency ?? ''} ${(v / 1e9).toFixed(1)}B`.trim();

function analyse(bundle: SymbolBundle) {
  const { income, balance, cash } = bundle.statements;
  const price = bundle.quote?.price ?? null;
  const marketCap = bundle.quote?.marketCap ?? null;

  // --- trailing inputs -----------------------------------------------------
  const revenue = trailingFlow(income.quarterly, income.annual, 'revenue');
  const netIncome = trailingFlow(income.quarterly, income.annual, 'netIncome');
  const grossProfit = trailingFlow(income.quarterly, income.annual, 'grossProfit');
  const ebit = trailingFlow(income.quarterly, income.annual, 'ebit');
  const ebitda = trailingFlow(income.quarterly, income.annual, 'ebitda');
  const rnd = trailingFlow(income.quarterly, income.annual, 'researchAndDevelopment');
  const dilutedEps = trailingFlow(income.quarterly, income.annual, 'dilutedEps');
  const dilutedShares = trailingStock(income.quarterly, income.annual, 'dilutedShares');

  const totalDebt = trailingStock(balance.quarterly, balance.annual, 'totalDebt');
  const cashPos = trailingStock(balance.quarterly, balance.annual, 'cash');
  const totalAssets = trailingStock(balance.quarterly, balance.annual, 'totalAssets');
  const equity = trailingStock(balance.quarterly, balance.annual, 'stockholdersEquity');
  const inventory = annualSeries(balance.annual, 'inventory');
  const receivables = annualSeries(balance.annual, 'receivables');

  const ocf = trailingFlow(cash.quarterly, cash.annual, 'operatingCashFlow');
  const capex = trailingFlow(cash.quarterly, cash.annual, 'capitalExpenditure');
  const dividendsPaid = trailingFlow(cash.quarterly, cash.annual, 'dividendsPaid');

  // --- derived -------------------------------------------------------------
  const fcf =
    ocf.value != null && capex.value != null
      ? // capex is reported negative by the provider
        ocf.value + (capex.value > 0 ? -capex.value : capex.value)
      : null;

  const enterpriseValue =
    marketCap != null && totalDebt.value != null && cashPos.value != null
      ? marketCap + totalDebt.value - cashPos.value
      : null;

  const netDebt =
    totalDebt.value != null && cashPos.value != null ? totalDebt.value - cashPos.value : null;

  const epsSeries = annualSeries(income.annual, 'dilutedEps');
  const revenueSeries = annualSeries(income.annual, 'revenue');
  const epsCagr = cagr(epsSeries);
  const pe = ratio(price, dilutedEps.value);

  // R&D-adjusted P/E (5.14): add R&D back to earnings before dividing.
  const rndAdjustedEps =
    netIncome.value != null && rnd.value != null && dilutedShares.value
      ? (netIncome.value + rnd.value) / dilutedShares.value
      : null;

  const roeSeries = (() => {
    const ni = annualSeries(income.annual, 'netIncome');
    const eq = annualSeries(balance.annual, 'stockholdersEquity');
    return ni
      .map((point) => {
        const match = eq.find((e) => e.period === point.period);
        return match && match.value > 0
          ? { period: point.period, value: point.value / match.value }
          : null;
      })
      .filter((x): x is { period: string; value: number } => x !== null);
  })();

  const drawdown = drawdownFromHigh(bundle.priceHistory, price);

  return {
    symbol: bundle.symbol,
    name: bundle.quote?.name ?? null,
    currency: bundle.quote?.currency ?? null,
    price,
    marketCap,
    // Which trailing basis each figure used — 'annual' means no quarterly data.
    basis: { revenue: revenue.basis, netIncome: netIncome.basis, ocf: ocf.basis },
    annualPeriods: income.annual?.periods.map((p) => p.endDate) ?? [],
    quarterlyPeriods: income.quarterly?.periods.map((p) => p.endDate) ?? [],

    ratios: {
      pe,
      pegTrailing: pe != null && epsCagr.value ? pe / (epsCagr.value * 100) : null,
      evEbit: ratio(enterpriseValue, ebit.value),
      pFcf: ratio(marketCap, fcf),
      ocfOverNetIncome: ratio(ocf.value, netIncome.value),
      roe: ratio(netIncome.value, averageAnnual(balance.annual, 'stockholdersEquity')),
      roa: ratio(netIncome.value, averageAnnual(balance.annual, 'totalAssets')),
      epsCagr: epsCagr.value,
      epsCagrYears: epsCagr.years,
      epsGrowthLatest: latestGrowth(epsSeries),
      revenueGrowthLatest: latestGrowth(revenueSeries),
      revenueCagr: cagr(revenueSeries).value,
      grossMargin: ratio(grossProfit.value, revenue.value),
      netMargin: ratio(netIncome.value, revenue.value),
      netDebtToEbitda: ratio(netDebt, ebitda.value),
      dividendYield: ratio(bundle.quote?.dividendPerShare ?? null, price),
      payoutRatio:
        dividendsPaid.value != null && netIncome.value
          ? Math.abs(dividendsPaid.value) / netIncome.value
          : null,
      rndAdjustedPe: ratio(price, rndAdjustedEps),
      rndOverRevenue: ratio(rnd.value, revenue.value),
      inventoryGrowth: latestGrowth(inventory),
      receivablesGrowth: latestGrowth(receivables),
      drawdown5y: drawdown.drawdown,
      recoveryNeeded: drawdown.recoveryNeeded,
    },

    inputs: {
      revenue: revenue.value,
      netIncome: netIncome.value,
      grossProfit: grossProfit.value,
      ebit: ebit.value,
      ebitda: ebitda.value,
      rnd: rnd.value,
      dilutedEps: dilutedEps.value,
      dilutedShares: dilutedShares.value,
      totalDebt: totalDebt.value,
      cash: cashPos.value,
      equity: equity.value,
      totalAssets: totalAssets.value,
      operatingCashFlow: ocf.value,
      capex: capex.value,
      freeCashFlow: fcf,
      enterpriseValue,
      netDebt,
      fiveYearHigh: drawdown.high,
      fiveYearHighDate: drawdown.highDate,
      priceHistoryPoints: bundle.priceHistory.length,
      roeByYear: roeSeries,
    },

    errors: bundle.errors,
    isStale: bundle.isStale,
  };
}

async function main() {
  const service = createMarketDataService();
  console.log(`Provider: ${service.providerName}\nSymbols:  ${SYMBOLS.join(', ')}\n`);

  const bundles = await service.getBundles(SYMBOLS, '5y');
  const analysed = SYMBOLS.map((s) => {
    const bundle = bundles.get(s);
    return bundle ? analyse(bundle) : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(analysed, null, 2));
    return;
  }

  for (const a of analysed) {
    console.log('='.repeat(72));
    console.log(`${a.symbol}  ${a.name ?? ''}`);
    console.log('='.repeat(72));
    console.log(
      `price ${num(a.price)} ${a.currency ?? ''}   market cap ${money(a.marketCap, a.currency)}`,
    );
    console.log(`annual periods:    ${a.annualPeriods.join(', ') || '—'}`);
    console.log(`quarterly periods: ${a.quarterlyPeriods.join(', ') || '— (none available)'}`);
    console.log(
      `trailing basis:    revenue=${a.basis.revenue} netIncome=${a.basis.netIncome} ocf=${a.basis.ocf}`,
    );
    if (a.errors.length) console.log(`notes: ${a.errors.join(' | ')}`);
    console.log();

    const r = a.ratios;
    const rows: Array<[string, string]> = [
      ['P/E (5.1)', num(r.pe)],
      ['PEG, trailing EPS CAGR (5.2)', num(r.pegTrailing)],
      ['EV/EBIT (5.3)', num(r.evEbit)],
      ['P/FCF (5.4)', num(r.pFcf)],
      ['OCF / net income (5.5)', num(r.ocfOverNetIncome)],
      ['ROE (5.6)', pct(r.roe)],
      ['ROA (5.7)', pct(r.roa)],
      [`EPS CAGR over ${num(r.epsCagrYears, 1)}y (5.8)`, pct(r.epsCagr)],
      ['EPS growth, last year (5.8)', pct(r.epsGrowthLatest)],
      ['Revenue growth, last year (5.9)', pct(r.revenueGrowthLatest)],
      ['Revenue CAGR (5.9)', pct(r.revenueCagr)],
      ['Gross margin (5.10)', pct(r.grossMargin)],
      ['Net margin (5.10)', pct(r.netMargin)],
      ['Net debt / EBITDA (5.11)', num(r.netDebtToEbitda)],
      ['Dividend yield (5.12)', pct(r.dividendYield)],
      ['Payout ratio (5.13)', pct(r.payoutRatio)],
      ['R&D-adjusted P/E (5.14)', num(r.rndAdjustedPe)],
      ['R&D / revenue (5.14)', pct(r.rndOverRevenue)],
      ['Inventory growth (5.17)', pct(r.inventoryGrowth)],
      ['Receivables growth (5.17)', pct(r.receivablesGrowth)],
      ['Drawdown from 5y high (5.18)', pct(r.drawdown5y)],
      ['Recovery needed (5.18)', pct(r.recoveryNeeded)],
    ];
    for (const [label, value] of rows) console.log(`  ${label.padEnd(34)} ${value.padStart(12)}`);

    console.log('\n  underlying figures');
    const i = a.inputs;
    const inputRows: Array<[string, string]> = [
      ['revenue (TTM)', money(i.revenue, a.currency)],
      ['gross profit', money(i.grossProfit, a.currency)],
      ['net income', money(i.netIncome, a.currency)],
      ['EBIT', money(i.ebit, a.currency)],
      ['EBITDA', money(i.ebitda, a.currency)],
      ['R&D', money(i.rnd, a.currency)],
      ['diluted EPS', num(i.dilutedEps)],
      ['diluted shares', money(i.dilutedShares, '')],
      ['operating cash flow', money(i.operatingCashFlow, a.currency)],
      ['capex', money(i.capex, a.currency)],
      ['free cash flow', money(i.freeCashFlow, a.currency)],
      ['total debt', money(i.totalDebt, a.currency)],
      ['cash', money(i.cash, a.currency)],
      ['net debt', money(i.netDebt, a.currency)],
      ['equity', money(i.equity, a.currency)],
      ['total assets', money(i.totalAssets, a.currency)],
      ['enterprise value', money(i.enterpriseValue, a.currency)],
      ['5y high', `${num(i.fiveYearHigh)} (${i.fiveYearHighDate ?? '—'})`],
      ['price history points', String(i.priceHistoryPoints)],
    ];
    for (const [label, value] of inputRows) {
      console.log(`  ${label.padEnd(34)} ${value.padStart(12)}`);
    }

    console.log('\n  ROE by fiscal year');
    for (const point of i.roeByYear) console.log(`  ${point.period.padEnd(34)} ${pct(point.value).padStart(12)}`);
    console.log();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
