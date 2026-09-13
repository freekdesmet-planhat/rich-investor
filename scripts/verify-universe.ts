/**
 * Checks the imported universe and the seeded sector mapping by resolving the
 * seed list against what is actually in the database.
 *
 * Worth running after every import: FinanceDatabase's labels move, and several
 * of the book's headline companies are filed under industries you would not
 * predict (Alphabet and Meta under Diversified Telecommunication Services,
 * Apple under Electronic Equipment, EssilorLuxottica under Health Care).
 *
 *   npx tsx --env-file=.env.local scripts/verify-universe.ts
 */
import { createClient } from '@supabase/supabase-js';
import { resolveFocusSector, type SectorRule } from '@/lib/sectors/mapping';

const SEED = [
  'NVDA', 'ASML', 'AAPL', 'MSFT', 'META', 'GOOGL', 'NFLX', 'AMZN', 'ADBE', 'AMD',
  'AVGO', 'AMAT', 'V', 'MA', 'PYPL', 'AXP', 'ADYEN.AS', 'TSLA', 'BKNG', 'NKE',
  'SBUX', 'RMS.PA', 'MC.PA', 'KER.PA', 'CFR.SW', 'EL.PA', 'DIS',
];

interface UniverseRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  region: string | null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: mapRows, error: mapError } = await sb.from('sector_mapping').select('*');
  if (mapError) throw new Error(mapError.message);

  const rules: SectorRule[] = (mapRows ?? []).map((r) => ({
    symbol: r.symbol ?? undefined,
    sector: r.sector ?? undefined,
    industry: r.industry ?? undefined,
    focusSector: r.focus_sector,
    specificity: r.specificity,
    isExcluded: r.is_excluded,
  }));

  const { count: universeCount } = await sb
    .from('universe')
    .select('symbol', { count: 'exact', head: true });

  const { data: rows, error } = await sb
    .from('universe')
    .select('symbol,name,sector,industry,region')
    .in('symbol', SEED)
    .returns<UniverseRow[]>();
  if (error) throw new Error(error.message);

  console.log(`universe rows:        ${universeCount?.toLocaleString() ?? '?'}`);
  console.log(`sector_mapping rules: ${rules.length}`);
  console.log(`seed symbols found:   ${rows?.length ?? 0}/${SEED.length}\n`);

  let outside = 0;
  for (const symbol of SEED) {
    const row = rows?.find((r) => r.symbol === symbol);
    if (!row) {
      console.log(`  ${symbol.padEnd(10)} NOT IN UNIVERSE`);
      continue;
    }
    const resolved = resolveFocusSector(rules, {
      symbol,
      sector: row.sector,
      industry: row.industry,
    });
    if (resolved.focusSector === 'outside_focus') outside++;
    console.log(
      `  ${symbol.padEnd(10)} ${(row.region ?? '?').padEnd(7)} ` +
        `${resolved.focusSector.padEnd(28)}` +
        (resolved.focusSector === 'outside_focus' ? '<- flagged outside the book’s focus' : ''),
    );
  }

  console.log(
    `\n${SEED.length - outside}/${SEED.length} seed tickers fall inside the four focus sectors.`,
  );
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
