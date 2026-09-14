/**
 * Watchlist membership actions.
 *
 * The behaviour worth pinning down is what these touch and what they leave
 * alone: adding must not trust the sector the browser posted, and removing must
 * take the membership row and nothing else — the analysis history cost real API
 * calls, and undo depends on it still being there.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = {
  user: { id: 'user-1' } as { id: string } | null,
  universe: new Map<string, { symbol: string; name: string | null; sector: string | null; industry: string | null }>(),
  watchlist: new Map<string, { symbol: string; name: string | null }>(),
  upserts: [] as Array<Record<string, unknown>>,
  deletes: [] as Array<{ table: string; symbol: string }>,
  /** Every table a query touched, so "left alone" is testable. */
  touched: [] as string[],
};

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => {
      db.touched.push(table);
      let symbol = '';
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (_col: string, value: string) => {
          symbol = value;
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'universe') return { data: db.universe.get(symbol) ?? null };
          if (table === 'watchlist_items') return { data: db.watchlist.get(symbol) ?? null };
          return { data: null };
        },
        returns: () => ({ data: table === 'sector_mapping' ? [] : [] }),
        upsert: async (row: Record<string, unknown>) => {
          db.upserts.push({ table, ...row });
          db.watchlist.set(String(row.symbol), {
            symbol: String(row.symbol),
            name: (row.name as string) ?? null,
          });
          return { error: null };
        },
        delete: () => ({
          eq: async (_col: string, value: string) => {
            db.deletes.push({ table, symbol: value });
            db.watchlist.delete(value);
            return { error: null };
          },
        }),
      };
      return builder;
    },
  }),
}));

const { addToWatchlist, removeFromWatchlist, restoreToWatchlist } = await import('./actions');

const form = (symbol: string) => {
  const fd = new FormData();
  fd.append('symbol', symbol);
  return fd;
};
const idle = { status: 'idle' } as const;

beforeEach(() => {
  db.user = { id: 'user-1' };
  db.universe = new Map([
    ['ADBE', { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology', industry: 'Software' }],
    ['XOM', { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', industry: 'Oil & Gas' }],
  ]);
  db.watchlist = new Map();
  db.upserts = [];
  db.deletes = [];
  db.touched = [];
});

describe('adding', () => {
  it('adds a known ticker and records how it got there', async () => {
    const state = await addToWatchlist(idle, form('ADBE'));

    expect(state).toMatchObject({ status: 'added', symbol: 'ADBE', name: 'Adobe Inc.' });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({ symbol: 'ADBE', added_via: 'manual', is_shared: true });
  });

  it('uppercases what was typed, so "adbe" finds ADBE', async () => {
    const state = await addToWatchlist(idle, form('adbe'));

    expect(state.status).toBe('added');
    expect(db.upserts[0]).toMatchObject({ symbol: 'ADBE' });
  });

  it('refuses a ticker that is not in the universe', async () => {
    const state = await addToWatchlist(idle, form('NOTREAL'));

    expect(state).toMatchObject({ status: 'error', message: 'unknown_symbol' });
    expect(db.upserts).toHaveLength(0);
  });

  /**
   * The sector decides which group the row appears under and whether it carries
   * the "outside the book's focus" warning, so it is resolved server-side from
   * the universe row rather than taken from the form.
   */
  it('resolves the focus sector itself and ignores anything posted', async () => {
    const fd = form('XOM');
    fd.append('focus_sector', 'information_technology');
    fd.append('outside_focus', 'false');

    await addToWatchlist(idle, fd);

    // Energy is outside the book's four focus sectors.
    expect(db.upserts[0]).toMatchObject({
      symbol: 'XOM',
      focus_sector: 'outside_focus',
      outside_focus: true,
    });
  });

  it('refuses when nobody is signed in', async () => {
    db.user = null;

    const state = await addToWatchlist(idle, form('ADBE'));

    expect(state.status).toBe('error');
    expect(db.upserts).toHaveLength(0);
  });
});

describe('removing', () => {
  beforeEach(async () => {
    await addToWatchlist(idle, form('ADBE'));
    db.upserts = [];
    db.touched = [];
  });

  it('removes the membership row and says what went', async () => {
    const state = await removeFromWatchlist(idle, form('ADBE'));

    expect(state).toMatchObject({ status: 'removed', symbol: 'ADBE', name: 'Adobe Inc.' });
    expect(db.deletes).toEqual([{ table: 'watchlist_items', symbol: 'ADBE' }]);
  });

  /**
   * The analysis is expensive to produce and the ticker may come back tomorrow.
   * Keeping it is also what makes undo a single insert rather than a re-run.
   */
  it('leaves the analysis history alone', async () => {
    await removeFromWatchlist(idle, form('ADBE'));

    expect(db.deletes.map((d) => d.table)).not.toContain('signal_history');
    expect(db.deletes.map((d) => d.table)).not.toContain('ratios');
    expect(db.touched).not.toContain('signal_history');
    expect(db.touched).not.toContain('ratios');
  });

  it('refuses when nobody is signed in', async () => {
    db.user = null;

    const state = await removeFromWatchlist(idle, form('ADBE'));

    expect(state.status).toBe('error');
    expect(db.deletes).toHaveLength(0);
  });
});

describe('undo', () => {
  it('puts back exactly what was removed', async () => {
    await addToWatchlist(idle, form('ADBE'));
    await removeFromWatchlist(idle, form('ADBE'));
    expect(db.watchlist.has('ADBE')).toBe(false);

    const state = await restoreToWatchlist(idle, form('ADBE'));

    expect(state).toMatchObject({ status: 'restored', symbol: 'ADBE' });
    expect(db.watchlist.has('ADBE')).toBe(true);
  });

  it('reports a failure rather than claiming it restored something', async () => {
    const state = await restoreToWatchlist(idle, form('NOTREAL'));

    expect(state.status).toBe('error');
  });
});
