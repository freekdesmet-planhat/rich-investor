'use client';

import { useEffect, useState } from 'react';

/**
 * What the insiders actually did, beside the checkbox that asks about it.
 *
 * "Management is buying its own shares" is one of the catalysts the reader
 * ticks, and until now answering it meant leaving the app and going to look.
 * The filings are public, so the app can look instead.
 *
 * Fetched after mount rather than rendered with the page. A cold refresh is
 * several seconds of EDGAR round-trips — one request for the filing index and
 * one per Form 4 — and a supporting detail beside a checkbox has no business
 * holding up the verdict, the chart and the review form behind it.
 *
 * Every failure renders as nothing. This is a convenience next to a question
 * the reader is answering themselves; if EDGAR is slow, or the company is a
 * non-US filer with no Form 4s at all, the honest and least intrusive answer
 * is to say so quietly and let them tick the box on their own judgement.
 */
export interface InsiderLabels {
  heading: string;
  /** Carries {days}. */
  window: string;
  loading: string;
  none: string;
  unavailable: string;
  /** Carries {count} and {shares}. */
  bought: string;
  sold: string;
  net: string;
  noPurchases: string;
  by: string;
  source: string;
}

interface Summary {
  buys: number;
  sells: number;
  sharesBought: number;
  sharesSold: number;
  netValue: number;
  buyers: string[];
  sellers: string[];
}

interface Payload {
  windowDays: number;
  summary: Summary;
  filingsRead: number;
  error: string | null;
}

export function InsiderActivity({
  symbol,
  locale,
  labels,
}: {
  symbol: string;
  locale: string;
  labels: InsiderLabels;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/insider/${encodeURIComponent(symbol)}`, { signal: controller.signal })
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

  const number = (value: number) => new Intl.NumberFormat(locale).format(Math.round(value));
  const money = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);

  const summary = data?.summary;
  const hasAnything = summary && (summary.buys > 0 || summary.sells > 0);

  return (
    <div className="mt-2 rounded-lg border border-line bg-surface-sunken px-3 py-2 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-semibold uppercase tracking-wider text-ink-subtle">
          {labels.heading}
        </span>
        {data && (
          <span className="text-ink-faint">
            {labels.window.replace('{days}', String(data.windowDays))}
          </span>
        )}
      </div>

      {state === 'loading' && <p className="mt-1.5 text-ink-faint">{labels.loading}</p>}
      {state === 'failed' && <p className="mt-1.5 text-ink-faint">{labels.unavailable}</p>}

      {state === 'ready' && summary && (
        <div className="mt-1.5 space-y-1">
          {!hasAnything && (
            <p className="text-ink-subtle">
              {data?.error ? labels.unavailable : labels.none}
            </p>
          )}

          {hasAnything && (
            <>
              {/* Purchases first and in the pass colour when there are any:
                  this block exists to answer one question, and open-market
                  buying is the answer to it. */}
              <p className={summary.buys > 0 ? 'font-medium text-pass' : 'text-ink-subtle'}>
                {summary.buys > 0
                  ? labels.bought
                      .replace('{count}', String(summary.buys))
                      .replace('{shares}', number(summary.sharesBought))
                  : labels.noPurchases}
              </p>
              {summary.buys > 0 && summary.buyers.length > 0 && (
                <p className="text-ink-subtle">
                  {labels.by} {summary.buyers.join(', ')}
                </p>
              )}

              {summary.sells > 0 && (
                <p className="text-ink-subtle">
                  {labels.sold
                    .replace('{count}', String(summary.sells))
                    .replace('{shares}', number(summary.sharesSold))}
                </p>
              )}

              <p className="text-ink-faint">
                {labels.net} {money(summary.netValue)}
              </p>
            </>
          )}

          <p className="pt-0.5 text-ink-faint">{labels.source}</p>
        </div>
      )}
    </div>
  );
}
