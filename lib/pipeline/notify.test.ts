/**
 * Buy-signal notification tests.
 *
 * The alert is the app's only outward action, so these pin the two properties
 * that matter most: it reaches every household member, and it cannot go out
 * twice for the same ticker on the same day.
 */
import { describe, expect, it, vi } from 'vitest';
import { sendBuySignalAlerts, type NotifiableSignal } from './notify';
import type { Mailer } from '@/lib/email/mailer';
import type { RatioKey, RatioResult } from '@/lib/ratios/engine';
import type { SignalResult } from '@/lib/signal/buyWorthy';

const UNIQUE_VIOLATION = '23505';

/**
 * Stand-in for Supabase that records inserts and can be told to reject a
 * repeat as Postgres would.
 */
function stubClient(options: { alreadySent?: Set<string> } = {}) {
  const alreadySent = options.alreadySent ?? new Set<string>();
  const inserts: Array<Record<string, unknown>> = [];

  const client = {
    inserts,
    from(table: string) {
      if (table === 'settings') {
        return {
          select: () => ({
            returns: async () => ({
              data: [
                { user_id: 'a', notify_email: 'me@example.com', language: 'en', notify_on_buy: true, notify_enabled: true },
                { user_id: 'b', notify_email: 'wife@example.com', language: 'nl', notify_on_buy: true, notify_enabled: true },
              ],
              error: null,
            }),
          }),
        };
      }
      return {
        async insert(row: Record<string, unknown>) {
          const key = `${row.recipient}:${row.symbol}:${row.as_of}`;
          if (alreadySent.has(key)) {
            return { error: { code: UNIQUE_VIOLATION, message: 'duplicate key' } };
          }
          alreadySent.add(key);
          inserts.push(row);
          return { error: null };
        },
        update: () => ({
          eq: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
        }),
      };
    },
  };
  return client as typeof client & Parameters<typeof sendBuySignalAlerts>[0];
}

function stubMailer(): Mailer & { sent: Array<{ to: string; subject: string; text: string }> } {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  return {
    canSend: true,
    sent,
    async send(message) {
      sent.push(message);
      return { to: message.to, ok: true, providerId: 'test-id', simulated: false };
    },
  };
}

const signal = (): NotifiableSignal => ({
  symbol: 'ADYEN.AS',
  name: 'Adyen N.V.',
  asOf: '2026-09-13',
  signal: {
    status: 'buy_worthy',
    lynchCategory: 'high_growth',
    conditions: [
      {
        key: 'drawdown',
        applicable: true,
        passed: true,
        value: -0.662,
        target: '≥ 50%',
        detail: { green: 0.5 },
      },
      {
        key: 'returns',
        applicable: true,
        passed: true,
        value: 0.223,
        target: 'ROE > 15% and ROA > 10%',
        detail: { roe: 0.223, roa: 0.18, roaIsAdjusted: true, roaRawValue: 0.09 },
      },
    ],
    conditionsMet: 9,
    conditionsApplicable: 9,
    pegBasis: 'forward',
    reliesOnForwardPeg: true,
    ratioSnapshot: {},
    missing: [],
  } as SignalResult,
  ratios: {
    drawdown_5y: {
      key: 'drawdown_5y',
      value: -0.662,
      unit: 'percent',
      color: 'green',
      targetLabel: '',
      targetSource: 'book',
      currency: null,
      thresholds: {},
      history: [],
      notApplicable: false,
      unavailableReason: null,
      detail: { high: 2746.5, recoveryNeeded: 1.957 },
    },
    roe: { value: 0.223, detail: { qualifyingYears: 4, yearsAvailable: 4 }, history: [] },
    roa: {
      value: 0.18,
      detail: { isAdjusted: true, rawValue: 0.09, isApproximation: true },
    },
    peg: { value: 1.17, detail: {} },
  } as unknown as Record<RatioKey, RatioResult>,
});

describe('buy-signal alerts', () => {
  it('emails every household member, each in their own language', async () => {
    const client = stubClient();
    const mailer = stubMailer();

    const outcomes = await sendBuySignalAlerts(client, [signal()], { mailer });

    expect(outcomes.filter((o) => o.state === 'sent')).toHaveLength(2);
    expect(mailer.sent.map((m) => m.to)).toEqual(['me@example.com', 'wife@example.com']);

    // Each gets their own language, from the same generator as the UI.
    expect(mailer.sent[0].subject).toBe('ADYEN.AS is now buy-worthy');
    expect(mailer.sent[1].subject).toBe('ADYEN.AS is koopwaardig geworden');
    expect(mailer.sent[1].text).toContain('koopwaardig');
  });

  it('includes the full explanation, not just the ticker', async () => {
    const mailer = stubMailer();
    await sendBuySignalAlerts(stubClient(), [signal()], { mailer });

    const body = mailer.sent[0].text;
    expect(body.length).toBeGreaterThan(120);
    // The figures that drove the signal have to be in the email itself.
    expect(body).toContain('66%');
    expect(body).toContain('2746.50');
    expect(body).toContain('adjusted for settlement balances');
  });

  it('never sends the same alert twice on the same day', async () => {
    const alreadySent = new Set<string>();
    const mailer = stubMailer();

    await sendBuySignalAlerts(stubClient({ alreadySent }), [signal()], { mailer });
    expect(mailer.sent).toHaveLength(2);

    // A re-run of the daily job: the log rows conflict, so nothing is re-sent.
    const second = await sendBuySignalAlerts(stubClient({ alreadySent }), [signal()], { mailer });
    expect(mailer.sent).toHaveLength(2);
    expect(second.every((o) => o.state === 'skipped')).toBe(true);
  });

  it('records a failure rather than reporting a send', async () => {
    const failing: Mailer = {
      canSend: true,
      async send(message) {
        return { to: message.to, ok: false, error: 'domain not verified', simulated: false };
      },
    };

    const outcomes = await sendBuySignalAlerts(stubClient(), [signal()], { mailer: failing });
    expect(outcomes.every((o) => o.state === 'failed')).toBe(true);
    expect(outcomes[0].error).toBe('domain not verified');
  });

  it('sends nothing when no recipient is configured', async () => {
    const empty = {
      from: () => ({ select: () => ({ returns: async () => ({ data: [], error: null }) }) }),
    } as unknown as Parameters<typeof sendBuySignalAlerts>[0];

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.NOTIFY_EMAILS;
    delete process.env.NOTIFY_EMAIL;

    expect(await sendBuySignalAlerts(empty, [signal()], { mailer: stubMailer() })).toEqual([]);
    warn.mockRestore();
  });
});

describe('audit trail honesty', () => {
  it('records a simulated send as skipped, never as sent', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const client = {
      from(table: string) {
        if (table === 'settings') {
          return {
            select: () => ({
              returns: async () => ({
                data: [
                  { user_id: 'a', notify_email: 'me@example.com', language: 'en', notify_on_buy: true, notify_enabled: true },
                ],
                error: null,
              }),
            }),
          };
        }
        return {
          insert: async () => ({ error: null }),
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            return { eq: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) };
          },
        };
      },
    } as unknown as Parameters<typeof sendBuySignalAlerts>[0];

    const simulating: Mailer = {
      canSend: false,
      async send(message) {
        return { to: message.to, ok: true, simulated: true };
      },
    };

    await sendBuySignalAlerts(client, [signal()], { mailer: simulating });

    expect(updates).toHaveLength(1);
    expect(updates[0].state).toBe('skipped');
    expect(String(updates[0].error)).toContain('RESEND_API_KEY');
  });
});
