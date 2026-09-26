/**
 * One-off end-to-end test of the price-trigger email (launch safety item 3).
 *
 * NOT wired into the cron path — run by hand:
 *   npm run test:price-alert
 *
 * It forces a trigger for one symbol, sends the alert to the TEST ACCOUNT ONLY
 * (explicit recipient, never the household), once in English and once in Dutch on
 * two different as-of dates so both pass dedup, then re-sends the Dutch one to
 * prove the (recipient, kind, symbol, as_of) index blocks a second send. Test
 * rows are cleaned up afterwards. Uses future as-of dates (2099) so it can never
 * collide with a real alert.
 */
import { createClient } from '@supabase/supabase-js';
import { createMailer, type Recipient } from '@/lib/email/mailer';
import { sendPriceAlerts, type PriceAlert } from '@/lib/pipeline/priceAlerts';

const TEST_EMAIL = 'freek.desmet@hotmail.com';
const TEST_USER_ID = 'a1eb1102-2f19-4bfe-af73-c93c3bd2f6a2';
const SYMBOL = 'ASML.AS';
const AS_OF_EN = '2099-01-01';
const AS_OF_NL = '2099-01-02';

function alert(asOf: string): PriceAlert {
  return {
    symbol: SYMBOL,
    name: 'ASML Holding N.V.',
    asOf,
    price: 190,
    trigger: 201.31,
    currency: 'EUR',
  };
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Run with --env-file-if-exists=.env.local');
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const mailer = createMailer();
  console.log(`mailer can send: ${mailer.canSend} (false = simulated, no real email)\n`);

  const en: Recipient = { email: TEST_EMAIL, lang: 'en', userId: TEST_USER_ID };
  const nl: Recipient = { email: TEST_EMAIL, lang: 'nl', userId: TEST_USER_ID };

  const clean = async () => {
    await admin
      .from('notifications_log')
      .delete()
      .eq('kind', 'price_alert')
      .in('as_of', [AS_OF_EN, AS_OF_NL]);
  };
  // Start clean in case a previous run left rows.
  await clean();

  console.log('1. English send:');
  const r1 = await sendPriceAlerts(admin, [alert(AS_OF_EN)], { mailer, recipients: [en], onProgress: (m) => console.log('   ' + m) });
  console.log('   outcomes:', JSON.stringify(r1));

  console.log('\n2. Dutch send (different as-of, so not deduped):');
  const r2 = await sendPriceAlerts(admin, [alert(AS_OF_NL)], { mailer, recipients: [nl], onProgress: (m) => console.log('   ' + m) });
  console.log('   outcomes:', JSON.stringify(r2));

  console.log('\n3. Dutch send AGAIN (same as-of) — expect dedup skip:');
  const r3 = await sendPriceAlerts(admin, [alert(AS_OF_NL)], { mailer, recipients: [nl], onProgress: (m) => console.log('   ' + m) });
  console.log('   outcomes:', JSON.stringify(r3));

  // Report the subjects actually written to the log.
  const { data: rows } = await admin
    .from('notifications_log')
    .select('as_of,lang,recipient,subject,state')
    .eq('kind', 'price_alert')
    .in('as_of', [AS_OF_EN, AS_OF_NL])
    .order('as_of', { ascending: true });
  console.log('\n=== notifications_log rows written ===');
  for (const row of rows ?? []) {
    console.log(`   [${row.lang}] as_of=${row.as_of} state=${row.state} to=${row.recipient}`);
    console.log(`        subject: "${row.subject}"`);
  }

  console.log('\n=== verdict ===');
  const enSent = r1[0]?.state === 'sent';
  const nlSent = r2[0]?.state === 'sent';
  const deduped = r3[0]?.state === 'skipped';
  console.log(`   EN sent:    ${enSent ? 'PASS' : 'FAIL (' + r1[0]?.state + ')'}`);
  console.log(`   NL sent:    ${nlSent ? 'PASS' : 'FAIL (' + r2[0]?.state + ')'}`);
  console.log(`   dedup skip: ${deduped ? 'PASS' : 'FAIL (' + r3[0]?.state + ')'}`);

  await clean();
  console.log('\n(test rows cleaned up)');
  process.exit(enSent && nlSent && deduped ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
