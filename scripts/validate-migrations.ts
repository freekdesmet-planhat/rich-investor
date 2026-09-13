/**
 * Applies every migration in supabase/migrations to a throwaway in-memory
 * Postgres (PGlite), so schema errors surface without a live Supabase project.
 *
 * PGlite has no Supabase runtime, so the bits Supabase provides are stubbed
 * first: the `auth` schema with `auth.users` and `auth.uid()`, and the
 * `authenticated` / `service_role` roles that the RLS policies grant to.
 *
 *   npm run db:validate
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

const SUPABASE_STUBS = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id    uuid primary key default gen_random_uuid(),
    email text
  );

  create or replace function auth.uid()
  returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  create or replace function auth.jwt()
  returns jsonb language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

  do $$ begin
    create role authenticated;
  exception when duplicate_object then null; end $$;

  do $$ begin
    create role service_role;
  exception when duplicate_object then null; end $$;
`;

async function main() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) throw new Error(`No migrations found in ${MIGRATIONS_DIR}`);

  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
      console.log(`  ok   ${file}`);
    } catch (error) {
      console.error(`  FAIL ${file}`);
      console.error(`       ${(error as Error).message}`);
      process.exitCode = 1;
      return;
    }
  }

  // Report what the migrations actually produced, so a silently missing table
  // is visible rather than implied by a clean run.
  const tables = await db.query<{ tablename: string; rowsecurity: boolean }>(
    `select tablename, rowsecurity from pg_tables
     where schemaname = 'public' order by tablename`,
  );
  const policies = await db.query<{ tablename: string; policyname: string }>(
    `select tablename, policyname from pg_policies where schemaname = 'public'`,
  );

  console.log(`\n${tables.rows.length} tables, ${policies.rows.length} RLS policies:\n`);
  for (const t of tables.rows) {
    const count = policies.rows.filter((p) => p.tablename === t.tablename).length;
    console.log(
      `  ${t.tablename.padEnd(22)} rls=${t.rowsecurity ? 'on ' : 'off'} policies=${count}`,
    );
  }

  // Every table holding user-owned or market data must have RLS enabled.
  const unprotected = tables.rows.filter((t) => !t.rowsecurity);
  if (unprotected.length > 0) {
    console.error(`\nTables without RLS: ${unprotected.map((t) => t.tablename).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nAll migrations applied cleanly.');
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
