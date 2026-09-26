/**
 * Loads the FinanceDatabase equities dataset into Supabase `universe`, and
 * seeds `sector_mapping` with the book's four focus sectors.
 *
 * Re-runnable: both tables are upserted, so refreshing the dataset later is the
 * same command. Existing sector_mapping rows are left alone unless --reset-map
 * is passed, so edits made in the settings screen survive a refresh.
 *
 *   npx tsx --env-file=.env.local scripts/import-universe.ts
 *   npx tsx --env-file=.env.local scripts/import-universe.ts --reset-map
 *   npx tsx --env-file=.env.local scripts/import-universe.ts --regions US,Europe
 */
import { createWriteStream } from 'node:fs';
import { mkdir, stat, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import bz2 from 'unbzip2-stream';
import { renameTicker } from '@/lib/data/tickerRenames';
import {
  DEFAULT_SECTOR_RULES,
  resolveFocusSector,
  resolveRegion,
  type Region,
} from '@/lib/sectors/mapping';

const SOURCE_URL =
  'https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main/compression/equities.bz2';
const CACHE_DIR = path.join(process.cwd(), '.cache');
const ARCHIVE = path.join(CACHE_DIR, 'equities.bz2');
const CSV = path.join(CACHE_DIR, 'equities.csv');

const UPSERT_BATCH = 1000;

interface Row {
  symbol: string;
  name: string;
  currency: string;
  sector: string;
  industry_group: string;
  industry: string;
  exchange: string;
  market: string;
  country: string;
  market_cap: string;
  delisted: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Run with --env-file=.env.local`);
  return value;
}

async function exists(file: string): Promise<boolean> {
  try {
    const info = await stat(file);
    return info.size > 0;
  } catch {
    return false;
  }
}

/** Downloads and decompresses the dataset, reusing the cached copy if present. */
async function ensureCsv(): Promise<string> {
  if (await exists(CSV)) {
    console.log(`Using cached ${path.relative(process.cwd(), CSV)}`);
    return CSV;
  }
  await mkdir(CACHE_DIR, { recursive: true });

  if (!(await exists(ARCHIVE))) {
    console.log(`Downloading ${SOURCE_URL} ...`);
    const response = await fetch(SOURCE_URL);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(ARCHIVE));
  }

  console.log('Decompressing ...');
  const { createReadStream } = await import('node:fs');
  await pipeline(createReadStream(ARCHIVE), bz2(), createWriteStream(CSV));
  return CSV;
}

async function main() {
  const args = process.argv.slice(2);
  const resetMap = args.includes('--reset-map');
  const regionArg = args.find((a) => a.startsWith('--regions='))?.split('=')[1];
  const regionFilter = regionArg ? new Set(regionArg.split(',') as Region[]) : null;

  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });

  // --- sector_mapping ------------------------------------------------------
  if (resetMap) {
    // `neq` on a never-matching value is how PostgREST expresses "delete all".
    const { error } = await supabase.from('sector_mapping').delete().neq('specificity', -1);
    if (error) throw new Error(`Clearing sector_mapping failed: ${error.message}`);
  }

  const mappingRows = DEFAULT_SECTOR_RULES.map((rule) => ({
    symbol: rule.symbol ?? null,
    sector: rule.sector ?? null,
    industry: rule.industry ?? null,
    focus_sector: rule.focusSector,
    specificity: rule.specificity,
    is_excluded: rule.isExcluded ?? false,
    note: rule.note ?? null,
  }));

  const { error: mapError } = await supabase
    .from('sector_mapping')
    .upsert(mappingRows, { onConflict: 'symbol,sector,industry', ignoreDuplicates: !resetMap });

  if (mapError) throw new Error(`Seeding sector_mapping failed: ${mapError.message}`);
  console.log(`sector_mapping: ${mappingRows.length} rules seeded`);

  // --- universe ------------------------------------------------------------
  const csvPath = await ensureCsv();
  console.log('Parsing CSV ...');
  const records = parse(await readFile(csvPath), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
  }) as Row[];

  console.log(`Parsed ${records.length.toLocaleString()} rows`);

  const counts = { delisted: 0, noSymbol: 0, filteredRegion: 0, kept: 0 };
  const byFocus = new Map<string, number>();
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (const record of records) {
    // Apply known ticker renames the source dataset lags (FISV -> FI, etc.).
    const symbol = renameTicker((record.symbol ?? '').trim());
    if (!symbol) {
      counts.noSymbol++;
      continue;
    }
    if ((record.delisted ?? '').trim().toLowerCase() === 'true') {
      counts.delisted++;
      continue;
    }
    // The dataset carries a handful of duplicate symbols; first row wins.
    if (seen.has(symbol)) continue;
    seen.add(symbol);

    const country = (record.country ?? '').trim() || null;
    const region = resolveRegion(country);
    if (regionFilter && !regionFilter.has(region)) {
      counts.filteredRegion++;
      continue;
    }

    const sector = (record.sector ?? '').trim() || null;
    const industry = (record.industry ?? '').trim() || null;
    const { focusSector } = resolveFocusSector(DEFAULT_SECTOR_RULES, { symbol, sector, industry });
    byFocus.set(focusSector, (byFocus.get(focusSector) ?? 0) + 1);

    counts.kept++;
    rows.push({
      symbol,
      name: (record.name ?? '').trim() || null,
      sector,
      industry_group: (record.industry_group ?? '').trim() || null,
      industry,
      exchange: (record.exchange ?? '').trim() || null,
      country,
      region,
      currency: (record.currency ?? '').trim() || null,
      market: (record.market ?? '').trim() || null,
      market_cap_band: (record.market_cap ?? '').trim() || null,
    });
  }

  console.log(
    `Keeping ${counts.kept.toLocaleString()} (skipped ${counts.delisted.toLocaleString()} delisted` +
      `${regionFilter ? `, ${counts.filteredRegion.toLocaleString()} out-of-region` : ''})`,
  );

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase.from('universe').upsert(batch, { onConflict: 'symbol' });
    if (error) throw new Error(`universe upsert failed at row ${i}: ${error.message}`);
    process.stdout.write(`\r  upserted ${Math.min(i + UPSERT_BATCH, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');

  console.log('\nFocus-sector breakdown:');
  for (const [focus, count] of [...byFocus.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${focus.padEnd(30)} ${count.toLocaleString().padStart(8)}`);
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
