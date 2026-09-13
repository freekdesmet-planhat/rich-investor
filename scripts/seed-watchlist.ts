/**
 * Puts the seed list from section 3.2 onto the shared watchlist.
 *
 * Runs before anyone has signed in, so the rows carry no author — they are
 * household property from the start. Re-runnable.
 *
 *   npx tsx --env-file=.env.local scripts/seed-watchlist.ts
 */
import { createClient } from '@supabase/supabase-js';
import { SEED_SYMBOLS } from '@/lib/pipeline/runDaily';
import { DEFAULT_SECTOR_RULES, resolveFocusSector } from '@/lib/sectors/mapping';

interface UniverseRow {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');

  const client = createClient(url, key, { auth: { persistSession: false } });

  const { data: universe } = await client
    .from('universe')
    .select('symbol,name,sector,industry')
    .in('symbol', SEED_SYMBOLS)
    .returns<UniverseRow[]>();

  const bySymbol = new Map((universe ?? []).map((row) => [row.symbol, row]));

  const rows = SEED_SYMBOLS.map((symbol) => {
    const meta = bySymbol.get(symbol);
    const focus = resolveFocusSector(DEFAULT_SECTOR_RULES, {
      symbol,
      sector: meta?.sector ?? null,
      industry: meta?.industry ?? null,
    });

    return {
      user_id: null,
      symbol,
      name: meta?.name ?? null,
      focus_sector: focus.focusSector,
      // Manual adds outside the focus sectors stay allowed, but flagged
      // (section 4); the seed list carries the same flag for the same reason.
      outside_focus: focus.focusSector === 'outside_focus',
      added_via: 'seed',
      is_shared: true,
    };
  });

  const { error } = await client.from('watchlist_items').upsert(rows, { onConflict: 'symbol' });
  if (error) throw new Error(error.message);

  console.log(`Seeded ${rows.length} tickers onto the shared watchlist.`);

  const outside = rows.filter((row) => row.outside_focus).map((row) => row.symbol);
  if (outside.length > 0) {
    console.log(`Flagged outside the book's focus sectors: ${outside.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
