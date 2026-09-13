'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { sendMagicLink, type SignInState } from './actions';

function SubmitButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
    >
      {pending ? busy : idle}
    </button>
  );
}

export function SignInForm({
  labels,
}: {
  labels: {
    email: string;
    send: string;
    sending: string;
    sent: string;
    invalid: string;
    error: string;
    hint: string;
  };
}) {
  const [state, action] = useActionState<SignInState, FormData>(sendMagicLink, {
    status: 'idle',
  });

  if (state.status === 'sent') {
    return (
      <p className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
        {labels.sent}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
          {labels.email}
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
      </label>

      <SubmitButton idle={labels.send} busy={labels.sending} />

      {state.status === 'error' && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {state.message === 'invalid_email' ? labels.invalid : labels.error}
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">{labels.hint}</p>
    </form>
  );
}
