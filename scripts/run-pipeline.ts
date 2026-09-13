/**
 * Runs the daily pipeline once over the seed list and prints the resulting
 * signal_history rows — the build-step 7 checkpoint.
 *
 *   npx tsx --env-file=.env.local scripts/run-pipeline.ts
 *   npx tsx --env-file=.env.local scripts/run-pipeline.ts ASML ADYEN.AS
 *   npx tsx --env-file=.env.local scripts/run-pipeline.ts --detail ASML
 */
import { createClient } from '@supabase/supabase-js';
import { runDailyPipeline, SEED_SYMBOLS } from '@/lib/pipeline/runDaily';

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');

  const args = process.argv.slice(2);
  const detailFor = args.includes('--detail') ? args[args.indexOf('--detail') + 1] : null;
  const explicit = args.filter((a) => !a.startsWith('--') && a !== detailFor);
  const symbols = explicit.length > 0 ? explicit : detailFor ? [detailFor] : SEED_SYMBOLS;

  const client = createClient(url, key, { auth: { persistSession: false } });

  const started = Date.now();
  const { rows, notifications } = await runDailyPipeline({
    client,
    symbols,
    skipNotifications: args.includes('--no-email'),
    onProgress: (message) => console.log(`  ${message}`),
  });
  console.log(`\nPipeline finished in ${((Date.now() - started) / 1000).toFixed(0)}s\n`);

  // --- summary table --------------------------------------------------------
  const header =
    `${'symbol'.padEnd(10)}${'status'.padEnd(13)}${'met'.padEnd(8)}` +
    `${'peg basis'.padEnd(11)}${'lynch'.padEnd(22)}focus sector`;
  console.log(header);
  console.log('-'.repeat(header.length + 10));

  for (const row of rows) {
    const met = `${row.conditionsMet}/${row.conditionsApplicable}`;
    console.log(
      `${row.symbol.padEnd(10)}${row.status.padEnd(13)}${met.padEnd(8)}` +
        `${row.pegBasis.padEnd(11)}${row.lynchCategory.padEnd(22)}${row.focusSector}` +
        (row.becameBuyWorthy ? '  <- NEW buy signal' : ''),
    );
  }

  if (notifications.length > 0) {
    const sent = notifications.filter((n) => n.state === 'sent').length;
    const skipped = notifications.filter((n) => n.state === 'skipped').length;
    const failed = notifications.filter((n) => n.state === 'failed');
    const simulated = notifications.some((n) => n.simulated);
    console.log(
      `\nNotifications: ${sent} ${simulated ? 'logged (no API key)' : 'sent'}` +
        `, ${skipped} already sent today` +
        (failed.length ? `, ${failed.length} failed` : ''),
    );
    for (const f of failed) console.log(`  ! ${f.symbol} -> ${f.recipient}: ${f.error}`);
  }

  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `\n${rows.length} tickers: ` +
      Object.entries(counts)
        .map(([status, n]) => `${n} ${status}`)
        .join(', '),
  );

  // --- full why-text for the requested ticker -------------------------------
  const wanted = detailFor ? [detailFor] : ['ASML', 'ADYEN.AS'];
  for (const symbol of wanted) {
    const row = rows.find((r) => r.symbol === symbol);
    if (!row) continue;

    console.log(`\n${'='.repeat(78)}\nsignal_history — ${symbol}\n${'='.repeat(78)}`);
    console.log(`status                 ${row.status}`);
    console.log(`conditions_met         ${row.conditionsMet}`);
    console.log(`conditions_applicable  ${row.conditionsApplicable}`);
    console.log(`peg_basis              ${row.pegBasis}`);
    console.log(`lynch_category         ${row.lynchCategory}`);
    console.log(`focus_sector           ${row.focusSector}`);
    console.log(`previous_status        ${row.previousStatus ?? '(none)'}`);
    console.log(`became_buy_worthy      ${row.becameBuyWorthy}`);
    if (row.errors.length) console.log(`errors                 ${row.errors.join(' | ')}`);
    console.log(`\nwhy_en:\n${row.whyEn}`);
    console.log(`\nwhy_nl:\n${row.whyNl}`);
  }
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
