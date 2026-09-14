'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type SignInState } from './actions';

export interface SignInLabels {
  email: string;
  password: string;
  passwordHint: string;
  signIn: string;
  signingIn: string;
  orLink: string;
  sendingLink: string;
  linkSent: string;
  hint: string;
  errors: Record<string, string>;
}

function Buttons({ labels }: { labels: SignInLabels }) {
  const { pending } = useFormStatus();

  return (
    <div className="space-y-2">
      <button
        type="submit"
        name="intent"
        value="password"
        disabled={pending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
      >
        {pending ? labels.signingIn : labels.signIn}
      </button>

      {/* The link route needs no password, so it stays available even with the
          password box empty. */}
      <button
        type="submit"
        name="intent"
        value="magiclink"
        disabled={pending}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        {labels.orLink}
      </button>
    </div>
  );
}

export function SignInForm({ next, labels }: { next?: string; labels: SignInLabels }) {
  const [state, action] = useActionState<SignInState, FormData>(signIn, { status: 'idle' });

  if (state.status === 'sent') {
    return (
      <p className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
        {labels.linkSent}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {/* Where the middleware interrupted them, so signing in returns them
          there instead of dropping everyone on the watchlist. */}
      {next && <input type="hidden" name="next" value={next} />}
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

      <label className="block">
        <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
          {labels.password}
        </span>
        {/* Not `required`: leaving it empty and asking for a link is a valid
            way to use this form. */}
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          {labels.passwordHint}
        </span>
      </label>

      <Buttons labels={labels} />

      {state.status === 'error' && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {labels.errors[state.message ?? ''] ?? labels.errors.generic}
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">{labels.hint}</p>
    </form>
  );
}
