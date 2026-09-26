'use client';

import { useEffect, useState } from 'react';

/**
 * What it would cost to actually trade this.
 *
 * Informational, and framed that way: no dot, no pass or fail, no effect on
 * the verdict. The nine conditions are unchanged. This answers a question
 * they do not ask — whether a position could be built and unwound without
 * the trading itself being the problem.
 *
 * Fetched after mount, because a quoted spread is only true while the market
 * is open and so cannot be captured by the nightly job. Renders nothing at
 * all on failure, like the insider block.
 */
export interface LiquidityLabels {
  heading: string;
  loading: string;
  volume: string;
  turnover: string;
  spread: string;
  thin: string;
  marketClosed: string;
  notQuoted: string;
  note: string;
}

interface Payload {
  averageDailyVolume: number | null;
  turnover: number | null;
  currency: string | null;
  spreadPercent: number | null;
  spreadUnavailable: 'market_closed' | 'not_quoted' | 'implausible' | null;
  thin: boolean;
}

export function LiquidityNote({
  symbol,
  locale,
  labels,
}: {
  symbol: string;
  locale: string;
  labels: LiquidityLabels;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/liquidity/${encodeURIComponent(symbol)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((payload: Payload) => {
        setData(payload);
        setState('ready');
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === 'AbortError') return;
        setState('failed');
      });
    return () => controller.abort();
  }, [symbol]);

  if (state === 'failed') return null;

  const compact = (value: number) =>
    new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  const money = (value: number, currency: string | null) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency ?? 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-xs">
      <span className="font-semibold uppercase tracking-wider text-ink-subtle">
        {labels.heading}
      </span>

      {state === 'loading' && <span className="text-ink-subtle">{labels.loading}</span>}

      {state === 'ready' && data && (
        <>
          {data.averageDailyVolume != null && (
            <span className="text-ink-muted">
              {labels.volume}{' '}
              <span className="font-medium tabular-nums text-ink">
                {compact(data.averageDailyVolume)}
              </span>
            </span>
          )}

          {data.turnover != null && (
            <span className={data.thin ? 'text-near' : 'text-ink-muted'}>
              {labels.turnover}{' '}
              <span className="font-medium tabular-nums">
                {money(data.turnover, data.currency)}
              </span>
              {data.thin && <span className="ml-1.5">· {labels.thin}</span>}
            </span>
          )}

          <span className="text-ink-muted">
            {labels.spread}{' '}
            {data.spreadPercent != null ? (
              <span className="font-medium tabular-nums text-ink">
                {data.spreadPercent.toFixed(2)}%
              </span>
            ) : (
              <span className="text-ink-subtle">
                {data.spreadUnavailable === 'market_closed'
                  ? labels.marketClosed
                  : labels.notQuoted}
              </span>
            )}
          </span>

          <span className="text-ink-subtle">{labels.note}</span>
        </>
      )}
    </div>
  );
}
