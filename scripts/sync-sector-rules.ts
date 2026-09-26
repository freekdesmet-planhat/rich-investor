/**
 * Sync the code's symbol-level sector overrides into the DB `sector_mapping`.
 *
 *   npx tsx --env-file=.env.local scripts/sync-sector-rules.ts
 *   npx tsx --env-file=.env.local scripts/sync-sector-rules.ts --dry
 *
 * The pipeline resolves focus sectors from the `sector_mapping` table (it is
 * editable), falling back to DEFAULT_SECTOR_RULES only when the table is empty.
 * The industry rules are seeded once by import-universe; the *symbol* overrides
 * (ROL out of focus, ABNB as luxury, the 2026-09-26 review fixes) are added in
 * code as symbolRule() and need to reach the table to take effect. This upserts
 * exactly those symbol rules — one row per symbol — leaving the industry rows and
 * anything a human edited in place. It is the mechanism behind "symbolRule stays
 * the fix": edit the code rule, run this, it is live.
 */
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SECTOR_RULES } from '@/lib/sectors/mapping';

async function main() {
  const dry = process.argv.includes('--dry');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');
  const client = createClient(url, key, { auth: { persistSession: false } });

  const symbolRules = DEFAULT_SECTOR_RULES.filter((r) => r.symbol);
  const rows = symbolRules.map((r) => ({
    symbol: r.symbol!,
    sector: null,
    industry: null,
    focus_sector: r.focusSector,
    specificity: r.specificity,
    is_excluded: r.isExcluded ?? false,
    is_payment_processor: r.isPaymentProcessor ?? false,
    note: r.note ?? null,
  }));

  console.log(`${symbolRules.length} symbol rules in code:`);
  for (const r of rows) console.log(`  ${r.symbol.padEnd(10)} -> ${r.focus_sector}`);

  if (dry) {
    console.log('\n[dry run] nothing written.');
    return;
  }

  // The table's unique index is (symbol, sector, industry) NULLS NOT DISTINCT
  // (migration 0010), so that is the conflict target; a symbol rule's null
  // sector/industry compare equal and a changed focus_sector in code wins.
  const { error } = await client
    .from('sector_mapping')
    .upsert(rows, { onConflict: 'symbol,sector,industry', ignoreDuplicates: false });
  if (error) throw new Error(`sector_mapping upsert failed: ${error.message}`);
  console.log(`\nUpserted ${rows.length} symbol rules into sector_mapping.`);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
