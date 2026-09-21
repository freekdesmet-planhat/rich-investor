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
      <span className="text-ink-subtle flex flex-wrap items-center gap-2 text-xs">
        {labels.removed.replace('{symbol}', symbol)}
        <form action={restoreAction}>
          <input type="hidden" name="symbol" value={symbol} />
          <SubmitButton
            idle={labels.undo}
            busy={labels.undo}
            className="text-ink-muted font-medium underline underline-offset-2 disabled:opacity-60"
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
            ? 'rounded px-2 py-1 text-xs text-ink-subtle transition hover:bg-surface-hover hover:text-ink disabled:opacity-60'
            : 'rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface-hover disabled:opacity-60'
        }
      />
      {state.status === 'error' && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
      )}
    </form>
  );
}
