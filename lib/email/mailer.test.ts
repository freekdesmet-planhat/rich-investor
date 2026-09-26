/**
 * Mailer and recipient-routing tests.
 *
 * The delivery path is the one part of the pipeline with an outside effect, so
 * these pin the behaviour that matters: who receives an alert, in which
 * language, and that a missing API key never looks like a successful send.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createMailer, resolveRecipients } from './mailer';

type SettingsRow = {
  user_id: string;
  notify_email: string | null;
  language: string | null;
  notify_on_buy: boolean;
  notify_enabled: boolean;
};

/** Minimal stand-in for the one query resolveRecipients makes. */
const stubClient = (rows: SettingsRow[]) =>
  ({
    from: () => ({
      select: () => ({ returns: async () => ({ data: rows, error: null }) }),
    }),
  }) as never;

describe('recipient routing', () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.NOTIFY_EMAILS;
    delete process.env.NOTIFY_EMAIL;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it('routes to every household member who opted in, in their own language', async () => {
    const recipients = await resolveRecipients(
      stubClient([
        { user_id: 'a', notify_email: 'me@example.com', language: 'en', notify_on_buy: true, notify_enabled: true },
        { user_id: 'b', notify_email: 'wife@example.com', language: 'nl', notify_on_buy: true, notify_enabled: true },
      ]),
    );

    expect(recipients).toHaveLength(2);
    expect(recipients.map((r) => r.email)).toEqual(['me@example.com', 'wife@example.com']);
    expect(recipients.find((r) => r.email === 'wife@example.com')?.lang).toBe('nl');
  });

  it('skips members who turned alerts off', async () => {
    const recipients = await resolveRecipients(
      stubClient([
        { user_id: 'a', notify_email: 'me@example.com', language: 'en', notify_on_buy: true, notify_enabled: true },
        { user_id: 'b', notify_email: 'wife@example.com', language: 'nl', notify_on_buy: false, notify_enabled: true },
        { user_id: 'c', notify_email: 'third@example.com', language: 'en', notify_on_buy: true, notify_enabled: false },
      ]),
    );

    expect(recipients.map((r) => r.email)).toEqual(['me@example.com']);
  });

  it('de-duplicates a shared mailbox, so one address gets one email', async () => {
    const recipients = await resolveRecipients(
      stubClient([
        { user_id: 'a', notify_email: 'house@example.com', language: 'en', notify_on_buy: true, notify_enabled: true },
        { user_id: 'b', notify_email: 'HOUSE@example.com', language: 'nl', notify_on_buy: true, notify_enabled: true },
      ]),
    );

    expect(recipients).toHaveLength(1);
  });

  /**
   * The case that went unnoticed: notifications on, `notify_on_buy` on, and
   * no address ever saved. The row was skipped, the fallback was empty, and
   * the nightly digest said only "no digest recipients configured" — true,
   * and indistinguishable from nobody having asked for mail at all.
   */
  it('says so when a member wants mail but has saved no address', async () => {
    const lines: string[] = [];
    const recipients = await resolveRecipients(
      stubClient([
        { user_id: 'u1', notify_email: null, language: 'en', notify_on_buy: true, notify_enabled: true },
      ]),
      (m) => lines.push(m),
    );

    expect(recipients).toEqual([]);
    expect(lines.join(' ')).toContain('no address saved');
    expect(lines.join(' ')).toContain('NOTIFY_EMAILS is not set');
  });

  it('stays quiet about a member who simply has notifications off', async () => {
    const lines: string[] = [];
    await resolveRecipients(
      stubClient([
        { user_id: 'u1', notify_email: null, language: 'en', notify_on_buy: false, notify_enabled: false },
      ]),
      (m) => lines.push(m),
    );

    expect(lines.join(' ')).not.toContain('no address saved');
  });

  it('falls back to NOTIFY_EMAILS before anyone has saved settings', async () => {
    process.env.NOTIFY_EMAILS = 'me@example.com, wife@example.com';
    const recipients = await resolveRecipients(stubClient([]));

    expect(recipients.map((r) => r.email)).toEqual(['me@example.com', 'wife@example.com']);
    expect(recipients.every((r) => r.userId === null)).toBe(true);
  });

  it('returns nobody rather than guessing when nothing is configured', async () => {
    expect(await resolveRecipients(stubClient([]))).toEqual([]);
  });
});

describe('mailer without an API key', () => {
  const original = process.env.RESEND_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = original;
  });

  it('reports that it cannot send, and marks the result simulated', async () => {
    delete process.env.RESEND_API_KEY;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mailer = createMailer();
    expect(mailer.canSend).toBe(false);

    const result = await mailer.send({
      to: 'me@example.com',
      subject: 'ADYEN.AS: checklist complete',
      text: 'why…',
    });

    // ok, so a local run is not treated as a failure — but never silently:
    // simulated is what tells the caller nothing actually went out.
    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('reports that it can send once a key is present', () => {
    process.env.RESEND_API_KEY = 're_test_key';
    expect(createMailer().canSend).toBe(true);
  });
});
