/**
 * Runs the universe auto-scan once and prints what it filed (build step 10).
 *
 *   npx tsx --env-file=.env.local scripts/run-scan.ts
 *   npx tsx --env-file=.env.local scripts/run-scan.ts --limit 60 --cursor 400
 */
import { createClient } from '@supabase/supabase-js';
import { runScan } from '@/lib/pipeline/scan';

function flag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) ? value : fallback;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');

  const client = createClient(url, key, { auth: { persistSession: false } });

  const started = Date.now();
  const result = await runScan({
    client,
    limit: flag('limit', 30),
    cursor: flag('cursor', 0),
    onProgress: (message) => console.log(`  ${message}`),
  });

  console.log(`\nScan finished in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(
    `evaluated ${result.evaluated}, suggested ${result.suggested}, ` +
      `no data for ${result.skipped}, next cursor ${result.nextCursor}\n`,
  );

  const interesting = result.candidates.filter((c) => c.status !== 'watching');
  if (interesting.length > 0) {
    console.log('Filed as suggestions:');
    for (const c of interesting) {
      console.log(`  ${c.symbol.padEnd(12)} ${c.status.padEnd(12)} ${c.conditionsMet} conditions`);
    }
  } else {
    console.log('Nothing cleared the bar in this batch.');
  }

  const near = result.candidates
    .filter((c) => c.status === 'watching')
    .sort((a, b) => b.conditionsMet - a.conditionsMet)
    .slice(0, 5);
  if (near.length > 0) {
    console.log('\nClosest misses:');
    for (const c of near) console.log(`  ${c.symbol.padEnd(12)} ${c.conditionsMet} conditions`);
  }
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
