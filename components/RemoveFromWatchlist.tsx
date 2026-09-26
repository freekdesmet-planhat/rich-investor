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
 *
 * `member` seeds the initial state, but membership is then tracked in this
 * component's own action state, not re-read from the prop. That is deliberate:
 * removing revalidates this page so its "on the watchlist" state is fresh on the
 * next visit (audit 14), which re-renders the server tree with member=false — and
 * if this control were gated on that prop by its parent, that re-render would
 * unmount it and take the just-shown "Removed · Undo" with it. Always mounted,
 * it keeps the undo through the refresh and simply renders nothing when the
 * ticker was never on the list.
 */
export function RemoveFromWatchlist({
  symbol,
  member,
  labels,
  compact = false,
}: {
  symbol: string;
  /** Whether the ticker is on the watchlist as of the server render. */
  member: boolean;
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
      <span className="text-xs text-pass">
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

  // Not on the list and nothing pending: the control has nothing to offer. This
  // gate lives here rather than in the parent so an add/remove revalidation that
  // re-renders the page cannot unmount a live "Removed · Undo" above.
  if (!member) return null;

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
        <p className="mt-1 text-xs text-fail">{state.message}</p>
      )}
    </form>
  );
}
