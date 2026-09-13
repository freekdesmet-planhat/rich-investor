/**
 * Writes ALLOWED_EMAILS into the `allowed_users` table.
 *
 * The table is what the RLS policies read, so this is what actually grants
 * access. Run after changing the env variable.
 *
 *   npx tsx --env-file=.env.local scripts/sync-allowlist.ts
 */
import { allowedEmailsFromEnv, syncAllowlist } from '@/lib/auth/allowlistAdmin';

async function main() {
  const emails = allowedEmailsFromEnv();
  if (emails.length === 0) {
    console.error('ALLOWED_EMAILS is empty — nobody would be able to sign in.');
    process.exitCode = 1;
    return;
  }

  const { synced } = await syncAllowlist();
  console.log(`allowed_users now contains ${synced.length} address(es):`);
  for (const email of synced) console.log(`  ${email}`);
}

main().catch((error) => {
  console.error(`\n${(error as Error).message}`);
  process.exitCode = 1;
});
