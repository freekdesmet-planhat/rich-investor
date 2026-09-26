'use client';

import { useActionState } from 'react';
import { AnalyseNow, type AnalyseLabels } from './AnalyseNow';
import { useFormStatus } from 'react-dom';
import { addToWatchlist, type WatchlistActionState } from '@/app/watchlist/actions';

export interface AddLabels {
  add: string;
  adding: string;
  onWatchlist: string;
  unknownSymbol: string;
  failed: string;
}

function Button({ labels }: { labels: AddLabels }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="border-line-strong text-ink-muted hover:bg-surface-hover shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-60"
    >
      {pending ? labels.adding : labels.add}
    </button>
  );
}

/**
 * The add control on a search result.
 *
 * Once added the control is replaced rather than disabled, because "on your
 * watchlist" is the useful thing to say — a greyed-out button leaves the reader
 * working out whether the click landed.
 */
export function AddToWatchlist({
  symbol,
  alreadyAdded,
  labels,
  analyseLabels,
}: {
  symbol: string;
  alreadyAdded: boolean;
  labels: AddLabels;
  /** When given, an add starts the analysis instead of waiting for the night. */
  analyseLabels?: AnalyseLabels;
}) {
  const [state, action] = useActionState<WatchlistActionState, FormData>(addToWatchlist, {
    status: 'idle',
  });

  const justAdded = state.status === 'added' || state.status === 'restored';
  const added = alreadyAdded || justAdded;

  if (added) {
    return (
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <span className="text-xs font-medium text-pass">
          ✓ {labels.onWatchlist}
        </span>
        {/* Only for an add that just happened here: a result already on the
            watchlist has been analysed long since, and re-running it on every
            search would spend provider calls to learn nothing. */}
        {justAdded && analyseLabels && (
          <AnalyseNow symbol={symbol} labels={analyseLabels} auto compact />
        )}
      </span>
    );
  }

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="symbol" value={symbol} />
      <Button labels={labels} />
      {state.status === 'error' && (
        <p className="mt-1 text-xs text-fail">
          {state.message === 'unknown_symbol' ? labels.unknownSymbol : labels.failed}
        </p>
      )}
    </form>
  );
}
