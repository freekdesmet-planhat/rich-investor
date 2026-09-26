/**
 * Runs the nightly price pass once and prints what it did (A12b).
 *
 *   npx tsx --env-file=.env.local scripts/run-price-pass.ts
 *   npx tsx --env-file=.env.local scripts/run-price-pass.ts --no-mid
 *
 * It writes real market caps back to the universe and queues any name that just
 * crossed a decline line — the same effects the 02:12 cron has — so it is a
 * genuine run, not a dry one. There are no notifications to suppress; the pass
 * only quotes, heals caps and queues.
 */
import { createClient } from '@supabase/supabase-js';
import { runPricePass } from '@/lib/pipeline/pricePass';

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');

  const client = createClient(url, key, { auth: { persistSession: false } });

  const started = Date.now();
  const result = await runPricePass({
    client,
    includeMid: !process.argv.includes('--no-mid'),
    onProgress: (message) => console.log(`  ${message}`),
  });

  console.log(`\nPrice pass finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log(
    `  cohort ${result.cohort}, priced ${result.priced}, ` +
      `${result.requests} requests, ${result.capsWritten} caps written`,
  );
  console.log(`  throttled: ${result.throttled}`);
  if (result.queued.length > 0) {
    console.log(`  queued ${result.queued.length}: ${result.queued.join(', ')}`);
  } else {
    console.log('  queued 0 (nothing crossed a decline line tonight)');
  }
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
