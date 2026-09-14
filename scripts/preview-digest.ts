/**
 * Prints the daily digest without sending or storing anything.
 *
 * Reads the latest evaluation of every watchlist ticker and builds the mail
 * each recipient would get, in both languages. Nothing is written to
 * `notifications_log` and no mail is sent, so this is safe to run against the
 * real database as often as you like.
 *
 *   npx tsx --env-file=.env.local scripts/preview-digest.ts
 *   npx tsx --env-file=.env.local scripts/preview-digest.ts --sample
 *
 * `--sample` additionally shows the mail for a made-up day on which something
 * moved, which is the only way to read the copy on a day when nothing did.
 */
import { createClient } from '@supabase/supabase-js';
import { buildDigest, type DigestEntry } from '@/lib/pipeline/digest';
import type { SignalStatus } from '@/lib/signal/buyWorthy';
import { LOCALES } from '@/lib/i18n/config';

interface SignalRow {
  symbol: string;
  as_of: string;
  status: SignalStatus;
  previous_status: SignalStatus | null;
  conditions_met: number;
  conditions_applicable: number;
  checklist: Array<{ key: string; applicable: boolean; passed: boolean }>;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');

  const client = createClient(url, key, { auth: { persistSession: false } });

  const { data: items } = await client
    .from('watchlist_items')
    .select('symbol,name')
    .returns<Array<{ symbol: string; name: string | null }>>();

  const names = new Map((items ?? []).map((i) => [i.symbol, i.name]));
  const symbols = [...names.keys()];

  const { data: signals } = await client
    .from('signal_history')
    .select('symbol,as_of,status,previous_status,conditions_met,conditions_applicable,checklist')
    .in('symbol', symbols)
    .order('as_of', { ascending: false })
    .returns<SignalRow[]>();

  const newest = new Map<string, SignalRow>();
  for (const row of signals ?? []) if (!newest.has(row.symbol)) newest.set(row.symbol, row);

  const entries: DigestEntry[] = [...newest.values()].map((row) => ({
    symbol: row.symbol,
    name: names.get(row.symbol) ?? null,
    status: row.status,
    previousStatus: row.previous_status,
    conditionsMet: row.conditions_met,
    conditionsApplicable: row.conditions_applicable,
    missing: (row.checklist ?? [])
      .filter((c) => c.applicable && !c.passed)
      .map((c) => c.key),
  }));

  const asOf = [...newest.values()][0]?.as_of ?? new Date().toISOString().slice(0, 10);
  console.log(`${entries.length} watchlist ticker(s) evaluated, as of ${asOf}\n`);

  for (const lang of LOCALES) {
    const digest = buildDigest(entries, asOf, lang);
    console.log('='.repeat(72));
    console.log(`REAL DATA — ${lang.toUpperCase()}`);
    console.log('='.repeat(72));
    if (!digest) {
      console.log('(nothing moved today — no mail would be sent)\n');
      continue;
    }
    console.log(`Subject: ${digest.subject}`);
    console.log(`Counts:  ${JSON.stringify(digest.counts)}\n`);
    console.log(digest.body);
    console.log();
  }

  if (!process.argv.includes('--sample')) return;

  // A day on which something moved, built from real tickers so the names and
  // the conditions are the ones this watchlist actually carries.
  const sample: DigestEntry[] = entries.slice(0, 6).map((e, i) =>
    i === 0
      ? { ...e, status: 'buy_worthy' as const, previousStatus: 'almost' as const, conditionsMet: e.conditionsApplicable, missing: [] }
      : i === 1
        ? { ...e, status: 'almost' as const, previousStatus: 'watching' as const }
        : i === 2
          ? { ...e, status: 'watching' as const, previousStatus: 'almost' as const }
          : i === 3
            ? { ...e, conditionsMet: e.conditionsApplicable - 1, missing: [e.missing[0] ?? 'drawdown'] }
            : e,
  );

  for (const lang of LOCALES) {
    const digest = buildDigest(sample, asOf, lang);
    console.log('='.repeat(72));
    console.log(`SAMPLE (a day on which something moved) — ${lang.toUpperCase()}`);
    console.log('='.repeat(72));
    if (!digest) {
      console.log('(still nothing to report)\n');
      continue;
    }
    console.log(`Subject: ${digest.subject}`);
    console.log(`Counts:  ${JSON.stringify(digest.counts)}\n`);
    console.log(digest.body);
    console.log();
  }
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
