'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  acceptSuggestion,
  dismissSuggestion,
  restoreSuggestion,
} from '@/app/suggestions/actions';
import { SUGGESTION_IDLE, type SuggestionActionState } from '@/lib/suggestions/state';

export interface DecisionLabels {
  accept: string;
  accepting: string;
  dismiss: string;
  dismissing: string;
  /** Carries {symbol}. */
  accepted: string;
  /** Carries {symbol} and {days}. */
  dismissed: string;
  /** Carries {symbol}. */
  restored: string;
  undo: string;
  restore: string;
  restoring: string;
  openAnalysis: string;
}

function SubmitButton({ idle, busy, className }: { idle: string; busy: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? busy : idle}
    </button>
  );
}

const PRIMARY =
  'rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300';
const SECONDARY =
  'rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800';
const LINKISH =
  'font-medium text-slate-700 underline underline-offset-2 disabled:opacity-60 dark:text-slate-200';

/**
 * Accept or dismiss, with a way back.
 *
 * Dismissing is one tap, it takes the candidate out of the feed for ninety
 * days, and it used to offer no confirmation and no undo — a mis-tap on a phone
 * quietly cost you a name the scan might not raise again for a quarter. The
 * undo sits in place of the buttons rather than in a timed toast, so it cannot
 * expire before it is read; the dismissal is only a state change, so taking it
 * back is one update and nothing has to be recomputed.
 */
export function SuggestionDecision({
  symbol,
  dismissed = false,
  labels,
}: {
  symbol: string;
  /** Renders the single "restore" action instead of accept/dismiss. */
  dismissed?: boolean;
  labels: DecisionLabels;
}) {
  const [accepted, acceptAction] = useActionState<SuggestionActionState, FormData>(
    acceptSuggestion,
    SUGGESTION_IDLE,
  );
  const [dismissedState, dismissAction] = useActionState<SuggestionActionState, FormData>(
    dismissSuggestion,
    SUGGESTION_IDLE,
  );
  const [restored, restoreAction] = useActionState<SuggestionActionState, FormData>(
    restoreSuggestion,
    SUGGESTION_IDLE,
  );

  if (restored.status === 'restored') {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-400">
        {labels.restored.replace('{symbol}', symbol)}
      </p>
    );
  }

  if (accepted.status === 'accepted') {
    return (
      <p className="text-sm text-emerald-700 dark:text-emerald-400">
        {labels.accepted.replace('{symbol}', symbol)}
      </p>
    );
  }

  // Dismissed in this session, or dismissed on a previous visit and being read
  // in the archive: the same undo serves both.
  if (dismissed || dismissedState.status === 'dismissed') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        {dismissedState.status === 'dismissed' && (
          <span>
            {labels.dismissed
              .replace('{symbol}', symbol)
              .replace('{days}', String(dismissedState.days ?? 90))}
          </span>
        )}
        <form action={restoreAction}>
          <input type="hidden" name="symbol" value={symbol} />
          <SubmitButton
            idle={dismissedState.status === 'dismissed' ? labels.undo : labels.restore}
            busy={labels.restoring}
            className={dismissedState.status === 'dismissed' ? LINKISH : SECONDARY}
          />
        </form>
      </div>
    );
  }

  const error = [accepted, dismissedState, restored].find((s) => s.status === 'error');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={acceptAction}>
        <input type="hidden" name="symbol" value={symbol} />
        <SubmitButton idle={labels.accept} busy={labels.accepting} className={PRIMARY} />
      </form>
      <form action={dismissAction}>
        <input type="hidden" name="symbol" value={symbol} />
        <SubmitButton idle={labels.dismiss} busy={labels.dismissing} className={SECONDARY} />
      </form>
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error.message}</p>
      )}
    </div>
  );
}
