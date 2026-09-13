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
  /** Plain text; the body is prose, so there is nothing HTML adds here. */
  text: string;
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
 */
export async function resolveRecipients(client: SupabaseClient): Promise<Recipient[]> {
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

  for (const row of data ?? []) {
    if (!row.notify_email || !row.notify_on_buy || !row.notify_enabled) continue;
    const email = row.notify_email.trim().toLowerCase();
    if (!email.includes('@')) continue;
    recipients.set(email, {
      email,
      lang: row.language === 'nl' ? 'nl' : 'en',
      userId: row.user_id,
    });
  }

  if (recipients.size === 0) {
    const fallback = (process.env.NOTIFY_EMAILS ?? process.env.NOTIFY_EMAIL ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@'));

    for (const email of fallback) {
      recipients.set(email, { email, lang: 'en', userId: null });
    }
  }

  return [...recipients.values()];
}
