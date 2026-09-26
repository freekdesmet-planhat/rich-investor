/**
 * Per-stock price-trigger notifications (launch item 10).
 *
 * The price pass already knows, each night, which subscribed names crossed the
 * 50% entry level. This mails the household when one does — the opt-in, per-stock
 * counterpart to the buy-signal alert. Deduplicated by the same
 * (recipient, kind, symbol, as_of) index, so a re-run cannot send twice.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMailer, resolveRecipients, type Mailer, type Recipient } from '@/lib/email/mailer';
import { formatCurrency } from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/config';

export interface PriceAlert {
  symbol: string;
  name: string | null;
  asOf: string;
  price: number;
  trigger: number;
  currency: string | null;
}

export interface PriceAlertOutcome {
  symbol: string;
  recipient: string;
  state: 'sent' | 'failed' | 'skipped';
  simulated: boolean;
  error?: string;
}

const COPY = {
  subject: {
    en: (symbol: string) => `${symbol} passed your entry level`,
    nl: (symbol: string) => `${symbol} is onder jouw instapniveau gezakt`,
  },
  body: {
    en: (name: string, symbol: string, price: string, trigger: string) =>
      `${name} (${symbol}) closed at ${price}, below the entry level of ${trigger} — the last ` +
      `condition it was missing. Open the app to run your review.\n\n` +
      `This is a personal analysis tool, not investment advice.`,
    nl: (name: string, symbol: string, price: string, trigger: string) =>
      `${name} (${symbol}) sloot op ${price}, onder het instapniveau van ${trigger} — de laatste ` +
      `voorwaarde die nog ontbrak. Open de app om je beoordeling te doen.\n\n` +
      `Dit is een persoonlijk analysehulpmiddel, geen beleggingsadvies.`,
  },
};

export async function sendPriceAlerts(
  client: SupabaseClient,
  alerts: PriceAlert[],
  options: {
    mailer?: Mailer;
    onProgress?: (message: string) => void;
    /** Explicit recipients, for a scoped one-off test; defaults to the household. */
    recipients?: Recipient[];
  } = {},
): Promise<PriceAlertOutcome[]> {
  const log = options.onProgress ?? (() => {});
  if (alerts.length === 0) return [];

  const recipients = options.recipients ?? (await resolveRecipients(client, log));
  if (recipients.length === 0) {
    log('no notification recipients configured — nothing sent');
    return [];
  }

  const mailer = options.mailer ?? createMailer();
  if (!mailer.canSend) log('RESEND_API_KEY is not set — price alerts will be logged, not sent');

  const outcomes: PriceAlertOutcome[] = [];

  for (const alert of alerts) {
    for (const recipient of recipients) {
      const lang = recipient.lang as Lang;
      const name = alert.name ?? alert.symbol;
      const price = formatCurrency(alert.price, alert.currency, lang);
      const trigger = formatCurrency(alert.trigger, alert.currency, lang);
      const subject = COPY.subject[lang](alert.symbol);
      const body = COPY.body[lang](name, alert.symbol, price, trigger);

      const { error: claimError } = await client.from('notifications_log').insert({
        user_id: recipient.userId,
        kind: 'price_alert',
        symbol: alert.symbol,
        as_of: alert.asOf,
        recipient: recipient.email,
        subject,
        body,
        lang: recipient.lang,
        state: 'sent',
      });

      if (claimError) {
        if (claimError.code === '23505') {
          outcomes.push({ symbol: alert.symbol, recipient: recipient.email, state: 'skipped', simulated: false });
          continue;
        }
        outcomes.push({ symbol: alert.symbol, recipient: recipient.email, state: 'failed', simulated: false, error: claimError.message });
        continue;
      }

      const result = await mailer.send({ to: recipient.email, subject, text: body });

      const patch: Record<string, unknown> | null = !result.ok
        ? { state: 'failed', error: result.error }
        : result.simulated
          ? { state: 'skipped', error: 'simulated — RESEND_API_KEY not set' }
          : result.providerId
            ? { provider_id: result.providerId }
            : null;

      if (patch) {
        await client
          .from('notifications_log')
          .update(patch)
          .eq('recipient', recipient.email)
          .eq('kind', 'price_alert')
          .eq('symbol', alert.symbol)
          .eq('as_of', alert.asOf);
      }

      outcomes.push({
        symbol: alert.symbol,
        recipient: recipient.email,
        state: result.ok ? 'sent' : 'failed',
        simulated: result.simulated,
        error: result.error,
      });
      log(`${result.ok ? (result.simulated ? 'logged' : 'sent') : 'FAILED'} price alert ${alert.symbol} -> ${recipient.email}`);
    }
  }

  return outcomes;
}
