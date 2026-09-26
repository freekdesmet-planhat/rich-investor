'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { joinWaitlist, type WaitlistState } from '@/app/waitlist/actions';

export interface WaitlistLabels {
  emailPlaceholder: string;
  join: string;
  joining: string;
  joined: string;
  invalid: string;
  error: string;
}

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent text-accent-ink hover:bg-accent-hover shrink-0 rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-60"
    >
      {pending ? busy : idle}
    </button>
  );
}

/**
 * The public waitlist sign-up (launch item 11).
 *
 * Email only — sign-up and billing are out of scope. The state comes from the
 * server action, so a success or a validation message reads the same with or
 * without JavaScript.
 */
export function WaitlistForm({ locale, labels }: { locale: string; labels: WaitlistLabels }) {
  const [state, action] = useActionState<WaitlistState, FormData>(joinWaitlist, { status: 'idle' });

  if (state.status === 'joined') {
    return (
      <p role="status" className="text-pass text-sm font-medium">
        {labels.joined}
      </p>
    );
  }

  return (
    <form action={action} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <input type="hidden" name="locale" value={locale} />
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder={labels.emailPlaceholder}
        aria-label={labels.emailPlaceholder}
        className="border-line-strong bg-canvas text-ink min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      <SubmitButton idle={labels.join} busy={labels.joining} />
      {(state.status === 'invalid' || state.status === 'error') && (
        <p role="alert" className="text-fail w-full text-xs sm:order-last">
          {state.status === 'invalid' ? labels.invalid : labels.error}
        </p>
      )}
    </form>
  );
}
