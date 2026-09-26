/**
 * One-off: seed real USD market caps for the null-band "valve" names (A1c).
 *
 *   npx tsx --env-file=.env.local scripts/backfill-valve-caps.ts
 *   npx tsx --env-file=.env.local scripts/backfill-valve-caps.ts --dry
 *
 * The universe's `market_cap_band` is static, and a set of large, real companies
 * carry a null band because the dataset never classified them (AutoZone, Blackstone,
 * Honeywell and the like). Search only surfaces those on an exact-ticker match and
 * labels them "size checked on analysis", because without a band or a real figure it
 * cannot floor them or show a size.
 *
 * The nightly scan can never fix this: it walks the Large/Mega bands only, so a
 * null-band name is never evaluated and never gets a cap written back. This script
 * closes that gap once — it fetches a quote for each valve name, runs the same
 * evaluation the pipeline runs, and writes the resulting USD cap back onto the
 * universe row via the shared `writeMarketCaps`. Afterwards search floors and labels
 * these names on the real figure, exactly like every scanned name. Re-runnable and
 * idempotent; it only ever updates `market_cap_usd`.
 */
import { createClient } from '@supabase/supabase-js';
import { createFxRates } from '@/lib/providers/fx';
import { createMarketDataService } from '@/lib/providers/marketData';
import { createSupabaseCache } from '@/lib/providers/supabaseCache';
import { DEFAULT_THRESHOLDS, mergeThresholds } from '@/lib/ratios/thresholds';
import { readThresholdOverrides } from '@/lib/pipeline/thresholdStore';
import { evaluateSymbol } from '@/lib/pipeline/evaluateSymbol';
import { writeMarketCaps, type MarketCapWrite } from '@/lib/pipeline/universeCaps';
import {
  DEFAULT_SECTOR_RULES,
  type FocusSector,
  type SectorRule,
} from '@/lib/sectors/mapping';

/**
 * The null-band names a user is likely to search by ticker. Membership is not
 * load-bearing — writing a real cap for any of these is the same correct A1c
 * write-back the pipeline does — so an extra or a since-reclassified name is
 * harmless.
 */
const VALVE_SYMBOLS = [
  'AZO', 'HON', 'BX', 'COF', 'OKE', 'JLL', 'VOD', 'EEFT', 'EXPO', 'FWONA',
  'FWONK', 'RBA', 'STNE', 'SNEX', 'CABO', 'STEP', 'SHO', 'SITE', 'MOFG', 'PGC',
  'OGS', 'HAE', 'TDS', 'IRS', 'OMF', 'OLP', 'KINS', 'LEVL', 'WSR', 'PS',
  'SRI', 'VERI',
];

async function main() {
  const dry = process.argv.includes('--dry');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');

  const client = createClient(url, key, { auth: { persistSession: false } });
  const asOf = new Date().toISOString().slice(0, 10);

  // --- reference data (same as the pipeline) --------------------------------
  const { data: mapRows } = await client
    .from('sector_mapping')
    .select('symbol,sector,industry,focus_sector,specificity,is_excluded,is_payment_processor')
    .returns<
      Array<{
        symbol: string | null;
        sector: string | null;
        industry: string | null;
        focus_sector: FocusSector;
        specificity: number;
        is_excluded: boolean;
        is_payment_processor: boolean;
      }>
    >();

  const rules: SectorRule[] = (mapRows ?? []).length
    ? (mapRows ?? []).map((r) => ({
        symbol: r.symbol ?? undefined,
        sector: r.sector ?? undefined,
        industry: r.industry ?? undefined,
        focusSector: r.focus_sector,
        specificity: r.specificity,
        isExcluded: r.is_excluded,
        isPaymentProcessor: r.is_payment_processor,
      }))
    : DEFAULT_SECTOR_RULES;

  const { data: universeRows } = await client
    .from('universe')
    .select('symbol,name,sector,industry,market_cap_band')
    .in('symbol', VALVE_SYMBOLS)
    .returns<
      Array<{ symbol: string; name: string | null; sector: string | null; industry: string | null; market_cap_band: string | null }>
    >();
  const universe = new Map((universeRows ?? []).map((r) => [r.symbol, r]));

  // --- quotes ---------------------------------------------------------------
  console.log(`fetching ${VALVE_SYMBOLS.length} valve names…`);
  const service = createMarketDataService({
    cache: createSupabaseCache(client),
    skipEstimates: true,
  });
  const bundles = await service.getBundles(VALVE_SYMBOLS, '5y');

  const pairs: Array<[string, string]> = [];
  for (const bundle of bundles.values()) {
    const quote = bundle.quote?.currency;
    if (!quote) continue;
    if (bundle.filingCurrency) pairs.push([quote, bundle.filingCurrency]);
    pairs.push([quote, 'USD']);
  }
  const fx = createFxRates();
  await fx.load(pairs);

  const stored = await readThresholdOverrides(client);
  const thresholds = Object.keys(stored ?? {}).length > 0
    ? mergeThresholds(stored as Record<string, unknown>)
    : DEFAULT_THRESHOLDS;

  // --- evaluate for the market cap only -------------------------------------
  const capUpdates: MarketCapWrite[] = [];
  for (const symbol of VALVE_SYMBOLS) {
    const bundle = bundles.get(symbol);
    if (!bundle) {
      console.log(`  ${symbol.padEnd(8)} no data`);
      continue;
    }
    const meta = universe.get(symbol);
    const result = evaluateSymbol({
      symbol,
      name: meta?.name ?? bundle.quote?.name ?? null,
      sector: meta?.sector ?? null,
      industry: meta?.industry ?? null,
      bundle,
      rules,
      thresholds,
      fx,
      asOf,
    });
    const cap = result.marketCapUsd;
    const band = meta?.market_cap_band ?? 'null';
    console.log(
      `  ${symbol.padEnd(8)} band=${String(band).padEnd(10)} cap=${
        cap != null ? `$${(cap / 1e9).toFixed(2)}bn` : '—'
      }`,
    );
    capUpdates.push({ symbol, marketCapUsd: cap });
  }

  if (dry) {
    const writable = capUpdates.filter((c) => c.marketCapUsd != null && Number.isFinite(c.marketCapUsd));
    console.log(`\n[dry run] would write ${writable.length} market cap(s); nothing changed.`);
    return;
  }

  const written = await writeMarketCaps(client, capUpdates);
  console.log(`\nwrote ${written} market cap(s) to universe.market_cap_usd.`);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
