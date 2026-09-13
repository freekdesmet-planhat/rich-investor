/**
 * Buy-signal notifications (section 3.6, build step 7).
 *
 * Sends as soon as a stock crosses from "not buy-worthy" into "buy-worthy",
 * with the full explanation in the body. Each household member gets it in
 * their own language.
 *
 * `notifications_log` has a unique index on
 * (recipient, kind, symbol, as_of), so a re-run of the daily job on the same
 * day cannot send the same alert twice — the insert conflicts and is skipped.
 * The log is written before the send is attempted, so a crash mid-send leaves a
 * record rather than a silent gap.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMailer, resolveRecipients, type Mailer } from '@/lib/email/mailer';
import { explainForEmail } from '@/lib/signal/explain';
import type { RatioKey, RatioResult } from '@/lib/ratios/engine';
import type { SignalResult } from '@/lib/signal/buyWorthy';

export interface NotifiableSignal {
  symbol: string;
  name: string | null;
  asOf: string;
  signal: SignalResult;
  ratios: Record<RatioKey, RatioResult>;
}

export interface NotifyOutcome {
  symbol: string;
  recipient: string;
  state: 'sent' | 'failed' | 'skipped';
  simulated: boolean;
  error?: string;
}

export async function sendBuySignalAlerts(
  client: SupabaseClient,
  signals: NotifiableSignal[],
  options: { mailer?: Mailer; onProgress?: (message: string) => void } = {},
): Promise<NotifyOutcome[]> {
  const log = options.onProgress ?? (() => {});
  if (signals.length === 0) return [];

  const recipients = await resolveRecipients(client);
  if (recipients.length === 0) {
    log('no notification recipients configured — nothing sent');
    return [];
  }

  const mailer = options.mailer ?? createMailer();
  if (!mailer.canSend) {
    log('RESEND_API_KEY is not set — alerts will be logged, not sent');
  }

  const outcomes: NotifyOutcome[] = [];

  for (const entry of signals) {
    for (const recipient of recipients) {
      const { subject, body } = explainForEmail(
        {
          symbol: entry.symbol,
          name: entry.name,
          signal: entry.signal,
          ratios: entry.ratios,
        },
        recipient.lang,
      );

      // Claim the send first. A conflict means it already went out today.
      const { error: claimError } = await client.from('notifications_log').insert({
        user_id: recipient.userId,
        kind: 'buy_signal',
        symbol: entry.symbol,
        as_of: entry.asOf,
        recipient: recipient.email,
        subject,
        body,
        lang: recipient.lang,
        state: 'sent',
      });

      if (claimError) {
        // 23505 is unique_violation: already sent today.
        if (claimError.code === '23505') {
          outcomes.push({
            symbol: entry.symbol,
            recipient: recipient.email,
            state: 'skipped',
            simulated: false,
          });
          continue;
        }
        outcomes.push({
          symbol: entry.symbol,
          recipient: recipient.email,
          state: 'failed',
          simulated: false,
          error: claimError.message,
        });
        continue;
      }

      const result = await mailer.send({ to: recipient.email, subject, text: body });

      // Correct the claimed row to what actually happened. A simulated send is
      // recorded as skipped, never as sent: the log is the audit trail, and it
      // must not claim an email went out when no key was configured.
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
          .eq('kind', 'buy_signal')
          .eq('symbol', entry.symbol)
          .eq('as_of', entry.asOf);
      }

      outcomes.push({
        symbol: entry.symbol,
        recipient: recipient.email,
        state: result.ok ? 'sent' : 'failed',
        simulated: result.simulated,
        error: result.error,
      });

      log(
        `${result.ok ? (result.simulated ? 'logged' : 'sent') : 'FAILED'} ` +
          `${entry.symbol} -> ${recipient.email}${result.error ? `: ${result.error}` : ''}`,
      );
    }
  }

  return outcomes;
}
