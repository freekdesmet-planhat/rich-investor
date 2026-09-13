/**
 * Build-step 2 / 4 checkpoint.
 *
 * Runs the real ratio engine over live provider data for ASML, META and
 * ADYEN.AS and prints every ratio with its colour, target and the figures
 * behind it, so the output can be sanity-checked against Yahoo Finance.
 *
 *   npx tsx --env-file=.env.local scripts/checkpoint-provider.ts
 *   npx tsx --env-file=.env.local scripts/checkpoint-provider.ts --json
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createFxRates } from '@/lib/providers/fx';
import { createMarketDataService } from '@/lib/providers/marketData';
import { createSupabaseCache } from '@/lib/providers/supabaseCache';
import {
  buildContext,
  computeAllRatios,
  derive,
  growthCategory,
  type RatioResult,
} from '@/lib/ratios/engine';
import { annualSeries, lastNYears, trendGrowth } from '@/lib/ratios/fundamentals';
import {
  resolveFocusSector,
  DEFAULT_SECTOR_RULES,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';

interface MappingRow {
  symbol: string | null;
  sector: string | null;
  industry: string | null;
  focus_sector: FocusSector;
  specificity: number;
  is_excluded: boolean;
}

interface UniverseRow {
  symbol: string;
  sector: string | null;
  industry: string | null;
}

const SYMBOLS = ['ASML', 'META', 'ADYEN.AS'];

const COLOR_MARK: Record<string, string> = {
  green: '[+]',
  orange: '[~]',
  red: '[-]',
  gray: '[ ]',
};

const RATIO_LABELS: Record<string, string> = {
  pe: 'P/E (5.1)',
  peg: 'PEG (5.2)',
  ev_ebit: 'EV/EBIT (5.3)',
  p_fcf: 'P/FCF (5.4)',
  earnings_quality: 'OCF / net income (5.5)',
  roe: 'ROE (5.6)',
  roa: 'ROA (5.7)',
  eps_growth: 'EPS growth, 5y CAGR (5.8)',
  revenue_growth: 'Revenue growth, 5y CAGR (5.9)',
  gross_margin: 'Gross margin (5.10)',
  net_margin: 'Net margin (5.10)',
  debt: 'Net debt / EBITDA (5.11)',
  dividend_yield: 'Dividend yield (5.12)',
  payout_ratio: 'Payout ratio (5.13)',
  rnd_adjusted_pe: 'R&D-adjusted P/E (5.14)',
  p_s: 'P/S (5.15)',
  p_b: 'P/B (5.16)',
  inventory_receivables: 'Inventory vs revenue (5.17)',
  drawdown_5y: 'Drawdown from 5y high (5.18)',
  market_cap: 'Market cap (5.19)',
};

function formatValue(r: RatioResult): string {
  if (r.value == null) return r.unavailableReason === 'not_applicable' ? 'n/a' : '—';
  switch (r.unit) {
    case 'percent':
      return `${(r.value * 100).toFixed(1)}%`;
    case 'currency':
      return `$${(r.value / 1e9).toFixed(1)}B`;
    default:
      return r.value.toFixed(2);
  }
}

const money = (v: number | null | undefined, currency: string | null) =>
  v == null ? '—' : `${currency ?? ''} ${(v / 1e9).toFixed(2)}B`.trim();

/**
 * Resolves the focus sector from the `universe` table, not from the quote.
 *
 * The two use different taxonomies: FinanceDatabase says "Information
 * Technology" / "Semiconductors & Semiconductor Equipment" where the quote
 * provider says "Technology" / "Semiconductor Equipment & Materials". The
 * sector mapping is written against FinanceDatabase's vocabulary, so resolving
 * against the quote's labels puts every ticker outside the focus.
 */
async function loadFocusSectors(
  symbols: string[],
  client: SupabaseClient | null,
): Promise<Map<string, FocusSector>> {
  const out = new Map<string, FocusSector>();
  if (!client) return out;

  const { data: mapRows } = await client
    .from('sector_mapping')
    .select('symbol,sector,industry,focus_sector,specificity,is_excluded')
    .returns<MappingRow[]>();

  const rules: SectorRule[] = (mapRows ?? []).length
    ? (mapRows ?? []).map((r) => ({
        symbol: r.symbol ?? undefined,
        sector: r.sector ?? undefined,
        industry: r.industry ?? undefined,
        focusSector: r.focus_sector,
        specificity: r.specificity,
        isExcluded: r.is_excluded,
      }))
    : DEFAULT_SECTOR_RULES;

  const { data: rows } = await client
    .from('universe')
    .select('symbol,sector,industry')
    .in('symbol', symbols)
    .returns<UniverseRow[]>();

  for (const row of rows ?? []) {
    out.set(
      row.symbol,
      resolveFocusSector(rules, {
        symbol: row.symbol,
        sector: row.sector,
        industry: row.industry,
      }).focusSector,
    );
  }
  return out;
}

async function main() {
  // Cache into Supabase when configured, so the checkpoint also exercises the
  // snapshot write path the daily job will use.
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  const cache = client ? createSupabaseCache(client) : undefined;

  const service = createMarketDataService(cache ? { cache } : {});
  console.log(`Symbols: ${SYMBOLS.join(', ')}`);
  console.log(`Snapshot cache: ${cache ? 'Supabase daily_snapshots' : 'disabled'}\n`);

  const bundles = await service.getBundles(SYMBOLS, '5y');

  // Load every FX pair the three tickers need, in one request.
  const fx = createFxRates();
  const pairs: Array<[string, string]> = [];
  for (const bundle of bundles.values()) {
    const quote = bundle.quote?.currency;
    if (!quote) continue;
    if (bundle.filingCurrency) pairs.push([quote, bundle.filingCurrency]);
    pairs.push([quote, 'USD']);
  }
  await fx.load(pairs);

  const focusSectors = await loadFocusSectors(SYMBOLS, client);

  const output: unknown[] = [];

  for (const symbol of SYMBOLS) {
    const bundle = bundles.get(symbol);
    if (!bundle) {
      console.log(`${symbol}: no data\n`);
      continue;
    }

    const focusSector = focusSectors.get(symbol) ?? 'outside_focus';
    const ctx = buildContext(bundle, { focusSector, fx });

    // The growth category sets the PEG threshold (1 / 0.7 / 0.5). The full
    // Lynch classification is build step 5; this is its growth axis only.
    const epsCagr = trendGrowth(
      lastNYears(annualSeries(bundle.statements.income.annual, 'dilutedEps'), 5),
    ).value;
    const category = growthCategory(epsCagr);

    const ratios = computeAllRatios(ctx, category);
    const d = derive(ctx);

    if (process.argv.includes('--json')) {
      output.push({ symbol, focusSector, category, ratios });
      continue;
    }

    const line = '='.repeat(78);
    console.log(line);
    console.log(`${symbol}  ${bundle.quote?.name ?? ''}`);
    console.log(line);
    console.log(`focus sector:      ${focusSector}   growth category: ${category}`);
    console.log(
      `price:             ${bundle.quote?.price?.toFixed(2) ?? '—'} ${ctx.quoteCurrency ?? ''}` +
        `   market cap ${money(bundle.quote?.marketCap, ctx.quoteCurrency)}`,
    );
    console.log(
      `currency:          quote ${ctx.quoteCurrency} / filing ${ctx.filingCurrency}` +
        (ctx.quoteCurrency !== ctx.filingCurrency
          ? `   FX ${ctx.fxApplied?.toFixed(4)} -> price ${ctx.price?.toFixed(2)} ${ctx.filingCurrency}`
          : '   (no conversion needed)'),
    );
    console.log(
      `sources:           statements ${bundle.statementSources.income ?? '—'}` +
        `   estimates ${bundle.estimatesSource ?? 'none'}`,
    );
    console.log(
      `annual periods:    ${bundle.statements.income.annual?.periods.length ?? 0}` +
        `   quarterly ${bundle.statements.income.quarterly?.periods.length ?? 0}` +
        `   trailing basis ${d.revenue.basis}`,
    );
    if (bundle.errors.length) console.log(`notes:             ${bundle.errors.join(' | ')}`);
    console.log();

    for (const [key, label] of Object.entries(RATIO_LABELS)) {
      const r = ratios[key as keyof typeof ratios];
      const mark = COLOR_MARK[r.color] ?? '[ ]';
      const reason =
        r.value == null && r.unavailableReason && r.unavailableReason !== 'not_applicable'
          ? `  (${r.unavailableReason})`
          : '';
      console.log(
        `  ${mark} ${label.padEnd(32)} ${formatValue(r).padStart(11)}   target ${r.targetLabel}` +
          ` [${r.targetSource === 'book' ? 'book' : 'app'}]${reason}`,
      );
    }

    const dd = ratios.drawdown_5y.detail as Record<string, number | string | null>;
    const peg = ratios.peg.detail as Record<string, unknown>;

    console.log('\n  underlying figures');
    for (const [label, value] of [
      ['revenue', money(d.revenue.value, ctx.filingCurrency)],
      ['gross profit', money(d.grossProfit.value, ctx.filingCurrency)],
      ['net income', money(d.netIncome.value, ctx.filingCurrency)],
      ['EBIT', money(d.ebit.value, ctx.filingCurrency)],
      ['EBITDA', money(d.ebitda, ctx.filingCurrency)],
      ['R&D', money(d.rnd.value, ctx.filingCurrency)],
      ['diluted EPS', d.dilutedEps.value?.toFixed(2) ?? '—'],
      ['operating cash flow', money(d.ocf.value, ctx.filingCurrency)],
      ['capex', money(d.capex.value, ctx.filingCurrency)],
      ['free cash flow', money(d.freeCashFlow, ctx.filingCurrency)],
      ['net debt', money(d.netDebt, ctx.filingCurrency)],
      ['equity', money(d.equity.value, ctx.filingCurrency)],
      ['enterprise value', money(d.enterpriseValue, ctx.filingCurrency)],
      ['5y high', `${dd.high ?? '—'} (${dd.highDate ?? '—'})`],
      [
        'recovery needed',
        dd.recoveryNeeded != null ? `${(Number(dd.recoveryNeeded) * 100).toFixed(1)}%` : '—',
      ],
      ['EPS CAGR years', peg.cagrYears != null ? Number(peg.cagrYears).toFixed(1) : '—'],
      ['forward PEG (estimates)', peg.forwardPeg != null ? Number(peg.forwardPeg).toFixed(2) : '—'],
    ] as Array<[string, string]>) {
      console.log(`  ${label.padEnd(34)} ${value.padStart(16)}`);
    }

    const roe = ratios.roe;
    console.log('\n  ROE by fiscal year');
    for (const point of roe.history) {
      console.log(
        `  ${point.period.padEnd(34)} ${`${(point.value * 100).toFixed(1)}%`.padStart(16)}`,
      );
    }
    console.log(
      `  -> ${roe.detail.qualifyingYears}/${roe.detail.yearsAvailable} years at or above 15%\n`,
    );
  }

  if (process.argv.includes('--json')) console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
