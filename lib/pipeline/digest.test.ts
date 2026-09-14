/**
 * The daily digest.
 *
 * Two behaviours carry the feature. It must not send on a quiet day — a mail
 * that usually says "nothing happened" trains the reader to ignore it, and then
 * it fails on the one morning it matters. And when it does send, the blocking
 * condition has to be named, because "one condition away" without saying which
 * one still means opening the site to find out.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildDigest, sendDailyDigest, type DigestEntry } from './digest';
import type { Mailer } from '@/lib/email/mailer';

const entry = (overrides: Partial<DigestEntry> = {}): DigestEntry => ({
  symbol: 'ADBE',
  name: 'Adobe Inc.',
  status: 'watching',
  previousStatus: 'watching',
  conditionsMet: 6,
  conditionsApplicable: 9,
  missing: ['drawdown', 'peg', 'debt'],
  ...overrides,
});

describe('deciding whether to send at all', () => {
  it('sends nothing when nothing moved', () => {
    expect(buildDigest([entry()], '2026-09-14', 'en')).toBeNull();
  });

  it('sends nothing for an empty run', () => {
    expect(buildDigest([], '2026-09-14', 'en')).toBeNull();
  });

  /** A ticker seen for the first time has not "changed" — there is no before. */
  it('does not call a first evaluation a change', () => {
    const first = entry({ previousStatus: null, conditionsMet: 5 });
    expect(buildDigest([first], '2026-09-14', 'en')).toBeNull();
  });

  it('sends when something flipped to buy-worthy', () => {
    const digest = buildDigest(
      [entry({ status: 'buy_worthy', previousStatus: 'almost', conditionsMet: 9, missing: [] })],
      '2026-09-14',
      'en',
    );
    expect(digest?.counts).toMatchObject({ flipped: 1 });
  });

  it('sends when a status changed in either direction', () => {
    const up = buildDigest([entry({ status: 'almost', previousStatus: 'watching' })], '2026-09-14', 'en');
    const down = buildDigest([entry({ status: 'watching', previousStatus: 'almost' })], '2026-09-14', 'en');
    expect(up?.counts.changed).toBe(1);
    expect(down?.counts.changed).toBe(1);
  });

  it('sends when something is a single condition away', () => {
    const digest = buildDigest(
      [entry({ conditionsMet: 8, conditionsApplicable: 9, missing: ['drawdown'] })],
      '2026-09-14',
      'en',
    );
    expect(digest?.counts).toMatchObject({ oneAway: 1 });
  });

  /**
   * "Almost there" also requires the first three conditions to hold, so a stock
   * can be one condition short without carrying that badge. The reader wants to
   * know either way, so the count is taken from the conditions.
   */
  it('counts one-away from the conditions, not from the badge', () => {
    const digest = buildDigest(
      [entry({ status: 'watching', conditionsMet: 8, conditionsApplicable: 9, missing: ['focus_sector'] })],
      '2026-09-14',
      'en',
    );
    expect(digest?.counts.oneAway).toBe(1);
  });

  it('never calls a buy-worthy stock one condition away', () => {
    const digest = buildDigest(
      [entry({ status: 'buy_worthy', previousStatus: 'buy_worthy', conditionsMet: 8, conditionsApplicable: 9 })],
      '2026-09-14',
      'en',
    );
    expect(digest).toBeNull();
  });

  it('does not report a flip twice', () => {
    const digest = buildDigest(
      [entry({ status: 'buy_worthy', previousStatus: 'watching', conditionsMet: 9, missing: [] })],
      '2026-09-14',
      'en',
    );
    expect(digest?.counts).toMatchObject({ flipped: 1, changed: 0 });
  });
});

describe('what the mail says', () => {
  const moved = [
    entry({ symbol: 'NVDA', name: 'NVIDIA', status: 'buy_worthy', previousStatus: 'almost', conditionsMet: 9, missing: [] }),
    entry({ symbol: 'ASML', name: 'ASML Holding', status: 'almost', previousStatus: 'watching' }),
    entry({ symbol: 'ADBE', conditionsMet: 8, conditionsApplicable: 9, missing: ['drawdown'] }),
  ];

  it('leads the subject with the most important thing that happened', () => {
    expect(buildDigest(moved, '2026-09-14', 'en')?.subject).toContain('buy-worthy');
  });

  it('falls back to changes, then to one-away, in the subject', () => {
    const changed = buildDigest([entry({ status: 'almost', previousStatus: 'watching' })], '2026-09-14', 'en');
    expect(changed?.subject).toMatch(/change/i);

    const away = buildDigest([entry({ conditionsMet: 8, missing: ['peg'] })], '2026-09-14', 'en');
    expect(away?.subject).toMatch(/one condition/i);
  });

  it('names the blocking condition rather than only counting it', () => {
    const body = buildDigest(moved, '2026-09-14', 'en')!.body;
    // 'drawdown' is rendered through the shared condition labels.
    expect(body).toContain('decline from the 5-year high');
    expect(body).not.toMatch(/missing: drawdown\b/);
  });

  it('shows where a status moved from and to', () => {
    const body = buildDigest(moved, '2026-09-14', 'en')!.body;
    expect(body).toContain('watching → almost there');
  });

  it('writes the whole mail in Dutch when that is the reader’s language', () => {
    const nl = buildDigest(moved, '2026-09-14', 'nl')!;
    expect(nl.subject).toMatch(/koopwaardig/);
    expect(nl.body).toContain('Nu koopwaardig');
    expect(nl.body).toContain('daling vanaf de 5-jaarstop');
    expect(nl.body).toContain('geen beleggingsadvies');
    // No English section headings leaking through.
    expect(nl.body).not.toMatch(/Now buy-worthy|One condition away|Changed:/);
  });

  it('carries the ticker and the company name', () => {
    const body = buildDigest(moved, '2026-09-14', 'en')!.body;
    expect(body).toContain('NVDA (NVIDIA)');
  });

  it('copes with a missing company name', () => {
    const body = buildDigest(
      [entry({ name: null, status: 'buy_worthy', previousStatus: 'watching', missing: [] })],
      '2026-09-14',
      'en',
    )!.body;
    expect(body).toContain('ADBE');
    expect(body).not.toContain('(null)');
  });
});

// --- sending -----------------------------------------------------------------

const db = {
  recipients: [
    { user_id: 'u1', notify_email: 'a@example.com', language: 'en', notify_on_buy: true, notify_enabled: true },
    { user_id: 'u2', notify_email: 'b@example.com', language: 'nl', notify_on_buy: true, notify_enabled: true },
  ] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  deletes: [] as string[],
  insertError: null as { code: string; message: string } | null,
};

const client = {
  from: (table: string) => {
    if (table === 'settings') {
      return { select: () => ({ returns: () => ({ data: db.recipients }) }) };
    }
    return {
      insert: async (row: Record<string, unknown>) => {
        if (db.insertError) return { error: db.insertError };
        db.inserts.push(row);
        return { error: null };
      },
      update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
      delete: () => ({
        eq: (_c: string, recipient: string) => ({
          eq: () => ({
            eq: async () => {
              db.deletes.push(recipient);
              return { error: null };
            },
          }),
        }),
      }),
    };
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const sent: Array<{ to: string; subject: string }> = [];
const mailer: Mailer = {
  canSend: true,
  send: async ({ to, subject }) => {
    sent.push({ to, subject });
    return { to, ok: true, simulated: false, providerId: 'test-id' };
  },
};

beforeEach(() => {
  db.inserts = [];
  db.deletes = [];
  db.insertError = null;
  sent.length = 0;
  vi.restoreAllMocks();
});

describe('sending', () => {
  const moved = [entry({ status: 'buy_worthy', previousStatus: 'watching', conditionsMet: 9, missing: [] })];

  it('sends one mail per recipient, each in their own language', async () => {
    const outcomes = await sendDailyDigest(client, moved, '2026-09-14', { mailer });

    expect(outcomes.map((o) => o.state)).toEqual(['sent', 'sent']);
    expect(sent.map((s) => s.to)).toEqual(['a@example.com', 'b@example.com']);
    expect(sent[0].subject).toMatch(/buy-worthy/);
    expect(sent[1].subject).toMatch(/koopwaardig/);
  });

  it('claims the row before sending, so a crash leaves a record', async () => {
    await sendDailyDigest(client, moved, '2026-09-14', { mailer });

    expect(db.inserts).toHaveLength(2);
    expect(db.inserts[0]).toMatchObject({ kind: 'daily_digest', symbol: null, as_of: '2026-09-14' });
  });

  /** A second run on the same day must not send a second digest. */
  it('skips when today’s digest already went out', async () => {
    db.insertError = { code: '23505', message: 'duplicate key' };

    const outcomes = await sendDailyDigest(client, moved, '2026-09-14', { mailer });

    expect(outcomes.every((o) => o.state === 'skipped')).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('sends nothing at all on a quiet day', async () => {
    const outcomes = await sendDailyDigest(client, [entry()], '2026-09-14', { mailer });

    expect(outcomes).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  /**
   * Resend refuses a recipient the sender is not allowed to reach, which is a
   * per-recipient failure on an otherwise fine run. The claim row is what makes
   * the next run skip, so leaving a failed one behind would mean that reader
   * silently never gets a digest that day.
   */
  it('clears the claim when the send fails, so it can be retried', async () => {
    const failing: Mailer = {
      canSend: true,
      send: async ({ to }) => ({ to, ok: false, simulated: false, error: 'not allowed' }),
    };

    const outcomes = await sendDailyDigest(client, moved, '2026-09-14', { mailer: failing });

    expect(outcomes.every((o) => o.state === 'failed')).toBe(true);
    expect(db.deletes).toEqual(['a@example.com', 'b@example.com']);
  });

  it('keeps the claim when the send succeeds, so it is not sent twice', async () => {
    await sendDailyDigest(client, moved, '2026-09-14', { mailer });

    expect(db.deletes).toEqual([]);
  });

  it('reports a write failure rather than claiming it sent', async () => {
    db.insertError = { code: '42501', message: 'permission denied' };

    const outcomes = await sendDailyDigest(client, moved, '2026-09-14', { mailer });

    expect(outcomes.every((o) => o.state === 'failed')).toBe(true);
    expect(sent).toHaveLength(0);
  });
});
