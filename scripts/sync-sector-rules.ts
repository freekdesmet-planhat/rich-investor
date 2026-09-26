/**
 * Reconcile the DB `sector_mapping` table to the code's DEFAULT_SECTOR_RULES.
 *
 *   npx tsx --env-file=.env.local scripts/sync-sector-rules.ts          # apply
 *   npx tsx --env-file=.env.local scripts/sync-sector-rules.ts --check  # drift only
 *
 * The pipeline resolves focus sectors from `sector_mapping`, falling back to
 * DEFAULT_SECTOR_RULES only when the table is empty — so a symbolRule that never
 * reaches the table is silently not live. That is how the Rollins fix sat dead.
 * Code is the source of truth: this makes the table equal DEFAULT_SECTOR_RULES,
 * so adding, changing or *removing* a rule in code becomes live once this runs.
 * It belongs in the deploy routine; `--check` is the smoke test that fails when
 * the table and the code have drifted.
 */
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SECTOR_RULES, type SectorRule } from '@/lib/sectors/mapping';

interface Row {
  symbol: string | null;
  sector: string | null;
  industry: string | null;
  focus_sector: string;
  specificity: number;
  is_excluded: boolean;
  is_payment_processor: boolean;
}

const key = (r: { symbol: string | null; sector: string | null; industry: string | null }) =>
  `${r.symbol ?? ''}|${r.sector ?? ''}|${r.industry ?? ''}`;

function toRow(rule: SectorRule): Row {
  return {
    symbol: rule.symbol ?? null,
    sector: rule.sector ?? null,
    industry: rule.industry ?? null,
    focus_sector: rule.focusSector,
    specificity: rule.specificity,
    is_excluded: rule.isExcluded ?? false,
    is_payment_processor: rule.isPaymentProcessor ?? false,
  };
}

/** Rows in code but not in the DB, and DB rows not in code / with a changed value. */
function diff(code: Row[], db: Row[]) {
  const dbByKey = new Map(db.map((r) => [key(r), r]));
  const codeByKey = new Map(code.map((r) => [key(r), r]));
  const same = (a: Row, b: Row) =>
    a.focus_sector === b.focus_sector &&
    a.specificity === b.specificity &&
    a.is_excluded === b.is_excluded &&
    a.is_payment_processor === b.is_payment_processor;
  const missing = code.filter((r) => !dbByKey.has(key(r)));
  const changed = code.filter((r) => dbByKey.has(key(r)) && !same(r, dbByKey.get(key(r))!));
  const extra = db.filter((r) => !codeByKey.has(key(r)));
  return { missing, changed, extra };
}

async function main() {
  const check = process.argv.includes('--check');
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) throw new Error('Run with --env-file=.env.local');
  const client = createClient(url, svc, { auth: { persistSession: false } });

  const code = DEFAULT_SECTOR_RULES.map(toRow);
  const { data: dbRows } = await client
    .from('sector_mapping')
    .select('symbol,sector,industry,focus_sector,specificity,is_excluded,is_payment_processor')
    .returns<Row[]>();
  const db = dbRows ?? [];

  const { missing, changed, extra } = diff(code, db);
  const drifted = missing.length + changed.length + extra.length;

  if (drifted === 0) {
    console.log(`sector_mapping matches code (${code.length} rules).`);
    return;
  }

  console.log(`drift: ${missing.length} missing, ${changed.length} changed, ${extra.length} extra`);
  for (const r of missing) console.log(`  + ${key(r)} -> ${r.focus_sector}`);
  for (const r of changed) console.log(`  ~ ${key(r)} -> ${r.focus_sector}`);
  for (const r of extra) console.log(`  - ${key(r)} (in DB, not in code)`);

  if (check) {
    console.error('\n[--check] sector_mapping is out of sync with the code rules.');
    process.exitCode = 1;
    return;
  }

  // Reconcile: clear and re-insert, so removals in code take effect too. The
  // check constraint requires symbol or sector, which every DEFAULT rule has.
  const { error: delError } = await client.from('sector_mapping').delete().neq('specificity', -1);
  if (delError) throw new Error(`clearing sector_mapping failed: ${delError.message}`);
  const { error: insError } = await client.from('sector_mapping').insert(code);
  if (insError) throw new Error(`inserting sector_mapping failed: ${insError.message}`);
  console.log(`\nReconciled sector_mapping to ${code.length} code rules.`);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
