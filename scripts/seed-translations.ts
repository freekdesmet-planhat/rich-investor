/**
 * Seeds the `translations` table from docs/ratios.en.md and docs/ratios.nl.md.
 *
 * The markdown files stay the source of truth; this copies them into the
 * database so the UI can read tooltip text with one query instead of parsing
 * markdown per request. Re-runnable — rows are upserted on
 * (namespace, key, field, lang).
 *
 *   npx tsx --env-file=.env.local scripts/seed-translations.ts
 *   npx tsx --env-file=.env.local scripts/seed-translations.ts --check
 */
import { createClient } from '@supabase/supabase-js';
import { LANGUAGES, loadDocs, type DocEntry, type Lang } from '@/lib/i18n/docs';

const FIELDS = ['name', 'target', 'explanation'] as const;

function rowsFor(lang: Lang, entries: DocEntry[]) {
  return entries.flatMap((entry) =>
    FIELDS.filter((field) => entry[field].length > 0).map((field) => ({
      namespace: entry.namespace,
      key: entry.key,
      field,
      lang,
      value: entry[field],
      source: 'docs',
    })),
  );
}

async function main() {
  const checkOnly = process.argv.includes('--check');

  const byLang = new Map<Lang, DocEntry[]>();
  for (const lang of LANGUAGES) byLang.set(lang, await loadDocs(lang));

  // Both languages must always exist together (section 2), so a key present in
  // one file and missing from the other is a build error, not a warning.
  const keysFor = (lang: Lang) =>
    new Set((byLang.get(lang) ?? []).map((e) => `${e.namespace}:${e.key}`));

  const en = keysFor('en');
  const nl = keysFor('nl');
  const missingInNl = [...en].filter((k) => !nl.has(k));
  const missingInEn = [...nl].filter((k) => !en.has(k));

  for (const [lang, entries] of byLang) {
    console.log(`docs/ratios.${lang}.md: ${entries.length} entries`);
  }

  if (missingInNl.length > 0 || missingInEn.length > 0) {
    console.error('\nLanguage files are out of step:');
    if (missingInNl.length) console.error(`  missing from Dutch:  ${missingInNl.join(', ')}`);
    if (missingInEn.length) console.error(`  missing from English: ${missingInEn.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Both languages cover the same ${en.size} keys.`);

  // An entry with no explanation would render an empty tooltip.
  const empty = [...byLang.entries()].flatMap(([lang, entries]) =>
    entries.filter((e) => e.explanation.length === 0).map((e) => `${lang}:${e.namespace}:${e.key}`),
  );
  if (empty.length > 0) {
    console.error(`\nEntries with no explanation: ${empty.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    console.log('Check only; nothing written.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file=.env.local');

  const client = createClient(url, key, { auth: { persistSession: false } });
  const rows = LANGUAGES.flatMap((lang) => rowsFor(lang, byLang.get(lang) ?? []));

  const { error } = await client
    .from('translations')
    .upsert(rows, { onConflict: 'namespace,key,field,lang' });
  if (error) throw new Error(`translations upsert failed: ${error.message}`);

  console.log(`Wrote ${rows.length} translation rows.`);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
