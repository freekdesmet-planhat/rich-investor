'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { restoreSuggestion } from '@/app/suggestions/actions';
import { SUGGESTION_IDLE, type SuggestionActionState } from '@/lib/suggestions/state';

export interface UndoLabels {
  /** Carries {symbol} and {days}. */
  dismissed: string;
  days: string;
  undo: string;
  restoring: string;
  /** Carries {symbol}. */
  restored: string;
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-medium text-amber-900 underline underline-offset-2 disabled:opacity-60 dark:text-amber-200"
    >
      {pending ? busy : idle}
    </button>
  );
}

/**
 * "You just dismissed this — put it back."
 *
 * Above the feed rather than inside the card, because the card is gone: the
 * page re-reads its rows on every render, so the moment a dismissal lands the
 * suggestion is no longer pending and anything rendered inside it is unmounted
 * before it can be read. What survives is state the server can see, so the
 * banner is driven by `decided_at` and this component only carries the result
 * of undoing.
 *
 * Not a timed toast: a mis-tap deserves an offer that is still there when you
 * look up, and the dismissed tab keeps the durable record either way.
 */
export function UndoDismissal({ symbol, labels }: { symbol: string; labels: UndoLabels }) {
  const [state, action] = useActionState<SuggestionActionState, FormData>(
    restoreSuggestion,
    SUGGESTION_IDLE,
  );

  if (state.status === 'restored') {
    return (
      <p
        role="status"
        className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      >
        {labels.restored.replace('{symbol}', symbol)}
      </p>
    );
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <span>
        {labels.dismissed.replace('{symbol}', symbol).replace('{days}', labels.days)}
      </span>
      <form action={action}>
        <input type="hidden" name="symbol" value={symbol} />
        <SubmitButton idle={labels.undo} busy={labels.restoring} />
      </form>
    </div>
  );
}
