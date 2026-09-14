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
 *   npx tsx --env-file=.env.local scripts/preview-digest.ts --html out/digest
 *
 * `--html <prefix>` also writes the HTML body per language to
 * `<prefix>.<lang>.html`, for opening in a browser. Still sends nothing.
 *
 * `--sample` additionally shows the mail for a made-up day on which something
 * moved, which is the only way to read the copy on a day when nothing did.
 */
import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'node:fs/promises';
import { buildDigest, type DigestEntry } from '@/lib/pipeline/digest';
import { renderDigestHtml } from '@/lib/templates/digest-email';
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
  ratio_snapshot: Record<string, number | null> | null;
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
    .select('symbol,as_of,status,previous_status,conditions_met,conditions_applicable,checklist,ratio_snapshot')
    .in('symbol', symbols)
    .order('as_of', { ascending: false })
    .returns<SignalRow[]>();

  const newest = new Map<string, SignalRow>();
  for (const row of signals ?? []) if (!newest.has(row.symbol)) newest.set(row.symbol, row);

  // The stored summaries, so the preview shows the same body the endpoint sends.
  const { data: summaries } = await client
    .from('ticker_summaries')
    .select('symbol,lang,thesis')
    .returns<Array<{ symbol: string; lang: string; thesis: string }>>();
  const thesisFor = new Map((summaries ?? []).map((s) => [`${s.symbol}:${s.lang}`, s.thesis]));

  const entries: DigestEntry[] = [...newest.values()].map((row) => {
    const snapshot = row.ratio_snapshot ?? {};
    return {
      symbol: row.symbol,
      name: names.get(row.symbol) ?? null,
      status: row.status,
      previousStatus: row.previous_status,
      conditionsMet: row.conditions_met,
      conditionsApplicable: row.conditions_applicable,
      missing: (row.checklist ?? [])
        .filter((c) => c.applicable && !c.passed)
        .map((c) => c.key),
      peg: snapshot.peg ?? null,
      roe: snapshot.roe ?? null,
      roa: snapshot.roa ?? null,
      drawdown: snapshot.drawdown_5y ?? null,
    };
  });

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

  const htmlFlag = process.argv.indexOf('--html');
  if (htmlFlag !== -1) {
    const prefix = process.argv[htmlFlag + 1] ?? 'digest';
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://richinvestor.netlify.app';
    for (const lang of LOCALES) {
      const digest = buildDigest(entries, asOf, lang);
      if (!digest) continue;
      const forLang = entries.map((e) => ({
        ...e,
        thesis: thesisFor.get(`${e.symbol}:${lang}`) ?? null,
      }));
      const html = renderDigestHtml({ entries: forLang, asOf, lang, baseUrl, subject: digest.subject });
      const file = `${prefix}.${lang}.html`;
      await writeFile(file, html, 'utf8');
      console.log(`wrote ${file} (${html.length} bytes)`);
    }
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
