'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  removeFromWatchlist,
  restoreToWatchlist,
  type WatchlistActionState,
} from '@/app/watchlist/actions';

export interface RemoveLabels {
  remove: string;
  removing: string;
  removed: string;
  undo: string;
  restored: string;
}

function SubmitButton({
  idle,
  busy,
  className,
}: {
  idle: string;
  busy: string;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? busy : idle}
    </button>
  );
}

/**
 * Remove, with undo.
 *
 * Removing is one tap and a mis-tap on a phone is cheap to make, so the undo is
 * offered in place rather than as a timed toast that can expire before it is
 * read — it stays until the row is navigated away from. Restoring is a single
 * row insert: the analysis history is never deleted, so nothing has to be
 * recomputed to put the ticker back.
 */
export function RemoveFromWatchlist({
  symbol,
  labels,
  compact = false,
}: {
  symbol: string;
  labels: RemoveLabels;
  compact?: boolean;
}) {
  const [state, action] = useActionState<WatchlistActionState, FormData>(removeFromWatchlist, {
    status: 'idle',
  });
  const [restoreState, restoreAction] = useActionState<WatchlistActionState, FormData>(
    restoreToWatchlist,
    { status: 'idle' },
  );

  if (restoreState.status === 'restored') {
    return (
      <span className="text-xs text-emerald-700 dark:text-emerald-400">
        {labels.restored.replace('{symbol}', symbol)}
      </span>
    );
  }

  if (state.status === 'removed') {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {labels.removed.replace('{symbol}', symbol)}
        <form action={restoreAction}>
          <input type="hidden" name="symbol" value={symbol} />
          <SubmitButton
            idle={labels.undo}
            busy={labels.undo}
            className="font-medium text-slate-700 underline underline-offset-2 disabled:opacity-60 dark:text-slate-200"
          />
        </form>
      </span>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="symbol" value={symbol} />
      <SubmitButton
        idle={labels.remove}
        busy={labels.removing}
        className={
          compact
            ? 'rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
            : 'rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800'
        }
      />
      {state.status === 'error' && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
      )}
    </form>
  );
}
