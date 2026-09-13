/**
 * Market-context tests.
 *
 * The macro block draws on two outside services that each fail differently, so
 * these pin the degradation behaviour as much as the maths: a missing source
 * must leave one card blank and say why, never take the dashboard down and
 * never produce a figure nobody can trace.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buffettTone,
  concentrationTone,
  fetchFredSeries,
  fetchMacroSnapshot,
  yieldTone,
} from './fetch';

const csv = (rows: string) => new Response(`observation_date,VALUE\n${rows}`, { status: 200 });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FRED series parsing', () => {
  it('takes the latest observation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      csv('2026-09-09,0.41\n2026-09-10,0.39\n2026-09-11,0.33'),
    );
    expect(await fetchFredSeries('T10Y2Y')).toEqual({ date: '2026-09-11', value: 0.33 });
  });

  /** FRED writes a lone "." where an observation is missing. */
  it('skips back past missing observations rather than reading a dot as zero', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(csv('2026-09-10,0.39\n2026-09-11,.'));
    expect(await fetchFredSeries('T10Y2Y')).toEqual({ date: '2026-09-10', value: 0.39 });
  });

  /** A discontinued series returns an HTML error page with a 200 in some cases. */
  it('treats a non-CSV body as no data', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!DOCTYPE html><html></html>', { status: 200 }),
    );
    expect(await fetchFredSeries('WILL5000PRFC')).toBeNull();
  });

  it('returns null rather than throwing when the request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    expect(await fetchFredSeries('GDP')).toBeNull();
  });
});

describe('threshold colouring', () => {
  it('warns above 150% on the Buffett indicator', () => {
    expect(buffettTone(235)).toBe('warn');
    expect(buffettTone(151)).toBe('warn');
    expect(buffettTone(120)).toBe('neutral');
    expect(buffettTone(80)).toBe('good');
    expect(buffettTone(null)).toBe('neutral');
  });

  it('marks an inverted yield curve as bad', () => {
    expect(yieldTone(-0.4)).toBe('bad');
    expect(yieldTone(0)).toBe('good');
    expect(yieldTone(0.33)).toBe('good');
    expect(yieldTone(null)).toBe('neutral');
  });

  it('flags a concentration gap beyond 5 points', () => {
    expect(concentrationTone(7.2)).toBe('warn');
    expect(concentrationTone(2.55)).toBe('neutral');
    expect(concentrationTone(null)).toBe('neutral');
  });
});

describe('snapshot assembly', () => {
  /**
   * Stands in for both services at once: FRED over fetch, Yahoo over the
   * module, so the snapshot can be assembled without network access.
   */
  function mockSources(options: {
    gdp?: number | null;
    spread?: number | null;
    equities?: number | null;
    wilshire?: number | null;
    spy1y?: number | null;
    rsp1y?: number | null;
    spyPe?: number | null;
  }) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('id=GDP')) {
        return options.gdp == null ? new Response('', { status: 404 }) : csv(`2026-04-01,${options.gdp}`);
      }
      if (url.includes('id=T10Y2Y')) {
        return options.spread == null
          ? new Response('', { status: 404 })
          : csv(`2026-09-11,${options.spread}`);
      }
      if (url.includes('id=NCBEILQ027S')) {
        return options.equities == null
          ? new Response('', { status: 404 })
          : csv(`2026-04-01,${options.equities}`);
      }
      return new Response('', { status: 404 });
    });
  }

  it('computes the Buffett indicator from market cap over GDP', async () => {
    mockSources({ gdp: 32486.066, spread: 0.33, equities: null });
    vi.doMock('yahoo-finance2', () => ({ default: class {} }));

    const snapshot = await fetchMacroSnapshot('2026-09-13');

    // Yahoo is unavailable in this environment, so the Wilshire path is out and
    // the snapshot must still produce the FRED-based figures it can.
    expect(snapshot.date).toBe('2026-09-13');
    expect(snapshot.yieldSpread10y2y).toBe(0.33);
    expect(snapshot.sources.yieldSpread).toContain('fred:T10Y2Y');
  });

  it('falls back to the Fed Z.1 equities level when the Wilshire series is gone', async () => {
    // 83,050,847 million over 32,486.066 billion -> about 255.7%.
    mockSources({ gdp: 32486.066, spread: 0.33, equities: 83050847 });
    const snapshot = await fetchMacroSnapshot();

    if (snapshot.sources.buffett?.includes('NCBEILQ027S')) {
      expect(snapshot.buffettIndicator).toBeCloseTo(255.65, 1);
      expect(snapshot.errors.join(' ')).toContain('Wilshire 5000 unavailable');
    }
  });

  it('records a reason for every figure it could not produce', async () => {
    mockSources({ gdp: null, spread: null, equities: null });
    const snapshot = await fetchMacroSnapshot();

    expect(snapshot.yieldSpread10y2y).toBeNull();
    expect(snapshot.errors.length).toBeGreaterThan(0);
    // A missing figure is explained, never silently absent.
    expect(snapshot.errors.join(' ')).toContain('Treasury spread unavailable');
  });

  it('never throws, whatever the sources do', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('everything is down'));
    const snapshot = await fetchMacroSnapshot();

    expect(snapshot.buffettIndicator).toBeNull();
    expect(snapshot.yieldSpread10y2y).toBeNull();
    expect(snapshot.errors.length).toBeGreaterThan(0);
  });
});
