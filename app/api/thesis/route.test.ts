/**
 * /api/thesis — the money endpoint.
 *
 * Three things are worth pinning down here, all of them about what happens when
 * something goes wrong rather than when it goes right:
 *
 *   nothing is written unless the server's own call to the provider completed,
 *   so an aborted stream cannot leave a partial row — the same failure shape
 *   that put placeholder prose in the table in the first place;
 *
 *   an unauthenticated POST is refused, because moving off a server action lost
 *   the implicit session and this endpoint sits on a public URL; and
 *
 *   a signed-in caller cannot loop on it, because every call costs money.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ThesisError } from '@/lib/ai/thesis';
import { resetRateLimits } from '@/lib/rateLimit';

/** Everything the route reads out of Supabase, plus what it wrote. */
const db = {
  user: { id: 'user-1' } as { id: string } | null,
  upserts: [] as Array<Record<string, unknown>>,
  signal: {
    as_of: '2026-09-13',
    status: 'buy_worthy',
    lynch_category: 'high_growth',
    focus_sector: 'information_technology',
    conditions_met: 9,
    conditions_applicable: 9,
    peg_basis: 'forward',
    checklist: [],
  } as Record<string, unknown> | null,
};

/** What the generation does on the next call. */
const generation: {
  deltas: string[];
  throws: unknown;
  onDelta?: (index: number) => void;
} = { deltas: ['one ', 'two ', 'three'], throws: null };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => {
      if (table === 'ticker_summaries') {
        return {
          upsert: async (row: Record<string, unknown>) => {
            db.upserts.push(row);
            return { error: null };
          },
        };
      }
      // signal_history / ratios / universe all read through the same shape.
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: table === 'signal_history' ? db.signal : null }),
        returns: () => ({ data: [] }),
      };
      return builder;
    },
  }),
}));

vi.mock('@/lib/ai/thesis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/thesis')>();
  return {
    ...actual,
    thesisEnabled: () => true,
    async *streamThesis(_context: unknown, lang: string, signal?: AbortSignal) {
      if (generation.throws) throw generation.throws;
      for (const [i, text] of generation.deltas.entries()) {
        if (signal?.aborted) {
          const error = new Error('aborted');
          error.name = 'AbortError';
          throw error;
        }
        generation.onDelta?.(i);
        yield text;
      }
      return {
        text: generation.deltas.join('').trim(),
        lang,
        model: 'fake-model',
        inputTokens: 10,
        outputTokens: 20,
      };
    },
  };
});

const { POST } = await import('./route');

const post = (body: unknown, init: RequestInit = {}) =>
  POST(
    new Request('http://localhost/api/thesis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...init,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );

/** Reads the NDJSON body into parsed events. */
async function events(response: Response) {
  const text = await response.text();
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { type: string; text?: string; code?: string });
}

beforeEach(() => {
  db.user = { id: 'user-1' };
  db.upserts = [];
  generation.deltas = ['one ', 'two ', 'three'];
  generation.throws = null;
  generation.onDelta = undefined;
  resetRateLimits();
});

describe('authentication', () => {
  it('refuses an unauthenticated POST with 401 and writes nothing', async () => {
    db.user = null;

    const response = await post({ symbol: 'ADBE', lang: 'en' });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'not_signed_in' });
    expect(db.upserts).toHaveLength(0);
  });

  it('lets a signed-in caller through', async () => {
    const response = await post({ symbol: 'ADBE', lang: 'en' });

    expect(response.status).toBe(200);
    const received = await events(response);
    expect(received.at(-1)).toMatchObject({ type: 'done' });
    expect(db.upserts).toHaveLength(1);
  });
});

describe('rate limiting', () => {
  it('allows a handful of calls, then answers 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const response = await post({ symbol: 'ADBE', lang: 'en' });
      statuses.push(response.status);
      if (response.status === 200) await response.text(); // drain
    }

    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(3);
    expect(statuses.at(-1)).toBe(429);
  });

  it('says how long to wait, and generates nothing while refusing', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await post({ symbol: 'ADBE', lang: 'en' });
      await ok.text();
    }
    const writesBefore = db.upserts.length;

    const refused = await post({ symbol: 'ADBE', lang: 'en' });

    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await refused.json()).toMatchObject({ code: 'rate_limited' });
    expect(db.upserts).toHaveLength(writesBefore);
  });

  it('counts per user, so one caller cannot lock another out', async () => {
    for (let i = 0; i < 6; i++) {
      const r = await post({ symbol: 'ADBE', lang: 'en' });
      if (r.status === 200) await r.text();
    }
    db.user = { id: 'user-2' };

    const other = await post({ symbol: 'ADBE', lang: 'en' });

    expect(other.status).toBe(200);
  });
});

describe('a partial stream is never persisted', () => {
  /**
   * The review point: the row must follow the server's completion of the
   * provider call, not the bytes reaching the client. Aborting mid-stream must
   * leave the table exactly as it was.
   */
  it('writes nothing when the caller aborts mid-stream', async () => {
    const controller = new AbortController();
    // Abort once the first chunk has been produced — mid-generation.
    generation.onDelta = (index) => {
      if (index === 1) controller.abort();
    };

    const response = await post({ symbol: 'ADBE', lang: 'en' }, { signal: controller.signal });
    await response.text().catch(() => '');

    expect(db.upserts).toHaveLength(0);
  });

  it('writes nothing when the generation fails part-way', async () => {
    generation.throws = new ThesisError('truncated', 'hit the ceiling');

    const response = await post({ symbol: 'ADBE', lang: 'en' });
    const received = await events(response);

    expect(received.at(-1)).toMatchObject({ type: 'error', code: 'truncated' });
    expect(db.upserts).toHaveLength(0);
  });

  it('writes exactly once, with the whole summary, on a clean finish', async () => {
    const response = await post({ symbol: 'ADBE', lang: 'nl' });
    await response.text();

    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({
      symbol: 'ADBE',
      lang: 'nl',
      thesis: 'one two three',
      generated_by: 'user-1',
    });
  });
});

describe('request validation', () => {
  it('refuses an unknown language before spending anything', async () => {
    const response = await post({ symbol: 'ADBE', lang: 'de' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'missing_symbol' });
    expect(db.upserts).toHaveLength(0);
  });

  /**
   * An anonymous caller should not be able to learn whether this deployment has
   * a provider key, so the session check runs before anything else.
   */
  it('tells an anonymous caller nothing beyond "not signed in"', async () => {
    db.user = null;

    const response = await post({ symbol: 'ADBE', lang: 'de' });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'not_signed_in' });
  });
});
