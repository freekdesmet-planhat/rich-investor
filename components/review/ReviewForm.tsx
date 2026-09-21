'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { saveReview } from '@/app/stock/[symbol]/reviewActions';
import { REVIEW_IDLE, type ReviewSaveState } from '@/lib/review/saveState';

export interface ReviewFormLabels {
  saved: string;
  savedAt: string;
  noteAdded: string;
  unsaved: string;
  failed: string;
}

/**
 * The review form, with an answer.
 *
 * Saving used to be silent. The action returned nothing, the page re-rendered
 * with the values already on screen, and the only way to know whether anything
 * had been written was to reload and look — on the one form in the app holding
 * something no provider can send again. So the form now says when it saved,
 * says when you have changed something since, and prints a database error
 * instead of replacing the page with a crash screen.
 *
 * A client component only for those three things: every field inside it is
 * still rendered on the server and passed in as children, so the translations
 * and the docs never cross the wire.
 */
export function ReviewForm({
  symbol,
  locale,
  labels,
  children,
}: {
  symbol: string;
  locale: string;
  labels: ReviewFormLabels;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ReviewSaveState, FormData>(saveReview, REVIEW_IDLE);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // What was just saved is, by definition, no longer unsaved. Adjusted during
  // render rather than in an effect: the new state and "not dirty any more" are
  // one fact, and splitting them across a second render pass would flash the
  // warning next to the confirmation.
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (dirty) setDirty(false);
  }

  useEffect(() => {
    if (state.status !== 'saved') return;

    // The note is a log entry, not a field: once written it belongs to the list
    // below, and leaving it in the box invites saving it a second time. The
    // rest of the form keeps its values, because they are the current state.
    const note = formRef.current?.elements.namedItem('note');
    if (note instanceof HTMLTextAreaElement) note.value = '';
  }, [state]);

  const savedAt =
    state.status === 'saved'
      ? new Date(state.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      // Change bubbles from every control in the form, so one listener covers
      // the radios, the checkboxes and both textareas. `input` catches typing,
      // which `change` alone would only report on blur.
      onChange={() => setDirty(true)}
      onInput={() => setDirty(true)}
      className="bg-surface border-line mt-4 space-y-5 rounded-lg border p-4"
    >
      <input type="hidden" name="symbol" value={symbol} />

      {children}

      {/* Announced, because the confirmation appears without the focus moving
          and a screen reader would otherwise never mention it. */}
      <p role="status" aria-live="polite" className="text-xs">
        {state.status === 'error' && (
          <span className="text-rose-700 dark:text-rose-300">
            {labels.failed.replace('{message}', state.message)}
          </span>
        )}
        {state.status === 'saved' && !dirty && (
          <span className="text-emerald-700 dark:text-emerald-300">
            {labels.savedAt.replace('{time}', savedAt ?? '')}
            {state.noteAdded && ` ${labels.noteAdded}`}
          </span>
        )}
        {dirty && <span className="text-amber-700 dark:text-amber-300">{labels.unsaved}</span>}
      </p>
    </form>
  );
}
