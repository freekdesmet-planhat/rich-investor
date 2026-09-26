/**
 * /api/analyse — running the nightly pipeline for one ticker, on demand.
 *
 * Everything worth pinning here is a guard. The endpoint sits on a public URL,
 * writes with the service role, and every call spends provider quota, so the
 * interesting cases are the ones where it must refuse:
 *
 *   an anonymous caller, because the session is the security boundary;
 *   a signed-in loop, because the quota is finite;
 *   a ticker nobody here follows, which is what stops this being a free
 *     "analyse anything" endpoint pointed at the whole universe; and
 *   a run that produced nothing, which must not be reported as success.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resetRateLimits } from '@/lib/rateLimit';

const db = {
  user: { id: 'user-1' } as { id: string } | null,
  /** The watchlist row the membership check finds, or null for "not ours". */
  member: { symbol: 'ADBE' } as { symbol: string } | null,
};

/** What the pipeline does on the next call. */
const pipeline: { rows: Array<Record<string, unknown>>; throws: unknown; calls: unknown[] } = {
  rows: [{ symbol: 'ADBE', status: 'almost', conditionsMet: 8, conditionsApplicable: 9 }],
  throws: null,
  calls: [],
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: () => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: db.member }),
      };
      return builder;
    },
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ marker: 'admin' }) }));

vi.mock('@/lib/pipeline/analyseOne', () => ({
  analyseOnDemand: async (client: unknown, symbol: string) => {
    pipeline.calls.push({ client, symbol });
    if (pipeline.throws) throw pipeline.throws;
    return { rows: pipeline.rows, notifications: [], digest: [] };
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { POST } = await import('./route');

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/analyse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
  );

beforeEach(() => {
  resetRateLimits();
  db.user = { id: 'user-1' };
  db.member = { symbol: 'ADBE' };
  pipeline.rows = [{ symbol: 'ADBE', status: 'almost', conditionsMet: 8, conditionsApplicable: 9 }];
  pipeline.throws = null;
  pipeline.calls = [];
});

describe('POST /api/analyse', () => {
  it('analyses a watchlist ticker and reports the result', async () => {
    const response = await post({ symbol: 'ADBE' });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      symbol: 'ADBE',
      status: 'almost',
      conditionsMet: 8,
      conditionsApplicable: 9,
    });
  });

  /** The write needs the service role; the guards above it are what earn it. */
  it('runs the pipeline with the admin client', async () => {
    await post({ symbol: 'ADBE' });
    expect(pipeline.calls).toEqual([{ client: { marker: 'admin' }, symbol: 'ADBE' }]);
  });

  it('accepts a lowercase symbol', async () => {
    await post({ symbol: 'adbe' });
    expect(pipeline.calls[0]).toMatchObject({ symbol: 'ADBE' });
  });

  it('refuses an anonymous caller before doing anything', async () => {
    db.user = null;
    const response = await post({ symbol: 'ADBE' });

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('not_signed_in');
    expect(pipeline.calls).toHaveLength(0);
  });

  /**
   * The check that keeps this from analysing gibberish: the ticker has to exist
   * in the universe (round 2, item 5 — any real company, not only watchlist ones).
   */
  it('refuses a ticker that is not in the universe', async () => {
    db.member = null;
    const response = await post({ symbol: 'ZZZZ' });

    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('unknown_symbol');
    expect(pipeline.calls).toHaveLength(0);
  });

  it('refuses a request with no symbol', async () => {
    const response = await post({});
    expect(response.status).toBe(400);
    expect(pipeline.calls).toHaveLength(0);
  });

  it('stops a signed-in loop', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await post({ symbol: 'ADBE' })).status);

    expect(codes.at(-1)).toBe(429);
    expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(10);
  });

  /** A run that found nothing is not a success, however cleanly it finished. */
  it('reports a run that produced no rows', async () => {
    pipeline.rows = [];
    const response = await post({ symbol: 'ADBE' });

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('no_data');
  });

  it('turns a provider failure into a code, not a stack trace', async () => {
    pipeline.throws = new Error('EDGAR returned 503');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post({ symbol: 'ADBE' });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.code).toBe('failed');
    expect(JSON.stringify(body)).not.toContain('EDGAR');
    // The provider's own wording still reaches the log.
    expect(error.mock.calls[0]?.[0]).toContain('EDGAR returned 503');
    error.mockRestore();
  });
});
