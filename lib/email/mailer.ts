/**
 * Email delivery via Resend (section 3.6).
 *
 * Every alert carries the full generated explanation, not just the ticker —
 * the body comes from the same generator that writes the detail page, so the
 * email and the app can never say different things.
 *
 * Recipients are the household: each member's `settings.notify_email` where
 * they have notifications on, falling back to NOTIFY_EMAILS for the daily job
 * running before anyone has signed in and saved settings.
 *
 * Without RESEND_API_KEY the mailer logs instead of sending. That is for local
 * development only, and it says so loudly — a production run with no key would
 * otherwise look like a successful send.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export interface Message {
  to: string;
  subject: string;
  /**
   * Plain text. Always sent, even alongside `html`: it is what a text-only
   * client, a screen reader and a spam filter read, and a mail with no text
   * part scores worse for deliverability than one with both.
   */
  text: string;
  /** Optional HTML part. The digest sends one; per-ticker alerts are prose. */
  html?: string;
}

export interface SendResult {
  to: string;
  ok: boolean;
  providerId?: string;
  error?: string;
  /** True when the message was logged rather than sent. */
  simulated: boolean;
}

export interface Mailer {
  readonly canSend: boolean;
  send(message: Message): Promise<SendResult>;
}

const FROM = process.env.RESEND_FROM ?? 'Rich Investor <onboarding@resend.dev>';

export function createMailer(): Mailer {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      canSend: false,
      async send(message) {
        console.warn(
          `[mailer] RESEND_API_KEY is not set — not sending. ` +
            `Would have sent to ${message.to}: ${message.subject}`,
        );
        console.warn(message.text);
        return { to: message.to, ok: true, simulated: true };
      },
    };
  }

  const resend = new Resend(apiKey);

  return {
    canSend: true,
    async send(message) {
      try {
        const { data, error } = await resend.emails.send({
          from: FROM,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        });
        if (error) return { to: message.to, ok: false, error: error.message, simulated: false };
        return { to: message.to, ok: true, providerId: data?.id, simulated: false };
      } catch (error) {
        return {
          to: message.to,
          ok: false,
          error: (error as Error).message,
          simulated: false,
        };
      }
    },
  };
}

export interface Recipient {
  email: string;
  /** The member's own language, so each gets the alert in theirs. */
  lang: 'en' | 'nl';
  userId: string | null;
}

/**
 * Who should receive alerts.
 *
 * Reads `settings` for members who have opted in, and falls back to
 * NOTIFY_EMAILS when nobody has saved settings yet. De-duplicated by address,
 * because both members pointing at one shared mailbox should get one email.
 *
 * `onProgress` exists because of how this failed in practice. A member had
 * notifications switched on and `notify_on_buy` set, but had never saved an
 * address — so the row was skipped, the fallback found nothing either, and
 * the nightly digest reported only "no digest recipients configured". That
 * is true and useless: it cannot distinguish nobody having asked for mail
 * from somebody having asked and the app having nowhere to send it. Both
 * cases now say which one they are.
 */
export async function resolveRecipients(
  client: SupabaseClient,
  onProgress?: (message: string) => void,
): Promise<Recipient[]> {
  const log = onProgress ?? (() => {});
  const { data } = await client
    .from('settings')
    .select('user_id,notify_email,language,notify_on_buy,notify_enabled')
    .returns<
      Array<{
        user_id: string;
        notify_email: string | null;
        language: string | null;
        notify_on_buy: boolean;
        notify_enabled: boolean;
      }>
    >();

  const recipients = new Map<string, Recipient>();
  /** Opted in, but with nowhere to send to — the case that used to vanish. */
  let wantingMailWithNoAddress = 0;

  for (const row of data ?? []) {
    const wantsMail = row.notify_enabled && row.notify_on_buy;
    const address = row.notify_email?.trim().toLowerCase() ?? '';

    if (wantsMail && !address.includes('@')) {
      wantingMailWithNoAddress++;
      continue;
    }
    if (!wantsMail || !address.includes('@')) continue;

    recipients.set(address, {
      email: address,
      lang: row.language === 'nl' ? 'nl' : 'en',
      userId: row.user_id,
    });
  }

  if (wantingMailWithNoAddress > 0) {
    log(
      `${wantingMailWithNoAddress} member(s) have notifications switched on but no ` +
        'address saved — set one under Account › Notifications',
    );
  }

  if (recipients.size === 0) {
    const raw = process.env.NOTIFY_EMAILS ?? process.env.NOTIFY_EMAIL ?? '';
    const fallback = raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'));

    for (const email of fallback) {
      recipients.set(email, { email, lang: 'en', userId: null });
    }

    if (fallback.length > 0) {
      log(`no member has saved an address; falling back to NOTIFY_EMAILS (${fallback.length})`);
    } else if (raw.trim() !== '') {
      log(`NOTIFY_EMAILS is set but holds no usable address: ${JSON.stringify(raw)}`);
    } else {
      log('NOTIFY_EMAILS is not set, so there is no fallback recipient either');
    }
  }

  return [...recipients.values()];
}
