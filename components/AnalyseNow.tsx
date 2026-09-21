'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AnalyseLabels {
  analyse: string;
  analysing: string;
  /** Carries {symbol}. */
  done: string;
  failed: string;
  noData: string;
}

type State = 'idle' | 'running' | 'done' | 'error';

interface Outcome {
  state: State;
  message: string | null;
  /** The row is rendered from the database, so a success has to re-render it. */
  refresh: boolean;
}

/**
 * Runs the analysis for one ticker and refreshes the row it sits on.
 *
 * A newly added stock arrived with no ratios and no signal, and the row said so
 * — "the nightly scan will analyse it" — which is a wait of up to a day for the
 * answer to the only question you had when you added it. Worse, it is a promise
 * nothing keeps until the nightly schedule is actually installed.
 *
 * `auto` is what makes adding feel immediate: the add action files the row, and
 * this fires once as soon as it renders. The button is the same thing on
 * purpose, for rows added before any of this existed — and for the honest case
 * where a provider was down and it is worth another go.
 */
export function AnalyseNow({
  symbol,
  labels,
  auto = false,
  compact = false,
}: {
  symbol: string;
  labels: AnalyseLabels;
  /** Start as soon as this appears, rather than waiting to be clicked. */
  auto?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  // Already running when it is going to start itself: setting that from inside
  // the effect would be a second render pass to say what was known before the
  // first one.
  const [state, setState] = useState<State>(auto ? 'running' : 'idle');
  const [message, setMessage] = useState<string | null>(null);

  /**
   * Returns what happened rather than setting state itself, so the caller
   * decides — which keeps every state change inside a completion callback
   * rather than in the body of an effect.
   */
  const request = useCallback(async (): Promise<Outcome> => {
    try {
      const response = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; code?: string }
        | null;

      if (response.ok && body?.ok) return { state: 'done', message: null, refresh: true };

      return {
        state: 'error',
        message: body?.code === 'no_data' ? labels.noData : labels.failed,
        refresh: false,
      };
    } catch {
      return { state: 'error', message: labels.failed, refresh: false };
    }
  }, [symbol, labels.failed, labels.noData]);

  const settle = useCallback(
    (outcome: Outcome) => {
      setState(outcome.state);
      setMessage(outcome.message);
      if (outcome.refresh) router.refresh();
    },
    [router],
  );

  useEffect(() => {
    if (!auto) return;

    // Guarded, because a row can be filtered away while its analysis is still
    // in flight and settling state on a component nobody is looking at is at
    // best wasted work.
    let alive = true;
    void request().then((outcome) => {
      if (alive) settle(outcome);
    });
    return () => {
      alive = false;
    };
  }, [auto, request, settle]);

  const start = () => {
    setState('running');
    setMessage(null);
    void request().then(settle);
  };

  if (state === 'done') {
    return (
      <span className="text-xs text-emerald-700 dark:text-emerald-400">
        {labels.done.replace('{symbol}', symbol)}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={start}
        disabled={state === 'running'}
        className={
          compact
            ? 'rounded px-2 py-1 text-xs text-ink-muted underline underline-offset-2 transition hover:text-ink disabled:opacity-60'
            : 'rounded-lg border border-line-strong px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface-hover disabled:opacity-60'
        }
      >
        {state === 'running' ? labels.analysing : labels.analyse}
      </button>
      {message && <span className="text-xs text-rose-600 dark:text-rose-400">{message}</span>}
    </span>
  );
}
