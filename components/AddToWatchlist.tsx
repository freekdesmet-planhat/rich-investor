'use client';

import { useActionState } from 'react';
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
      className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
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
}: {
  symbol: string;
  alreadyAdded: boolean;
  labels: AddLabels;
}) {
  const [state, action] = useActionState<WatchlistActionState, FormData>(addToWatchlist, {
    status: 'idle',
  });

  const added = alreadyAdded || state.status === 'added' || state.status === 'restored';

  if (added) {
    return (
      <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        ✓ {labels.onWatchlist}
      </span>
    );
  }

  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="symbol" value={symbol} />
      <Button labels={labels} />
      {state.status === 'error' && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          {state.message === 'unknown_symbol' ? labels.unknownSymbol : labels.failed}
        </p>
      )}
    </form>
  );
}
