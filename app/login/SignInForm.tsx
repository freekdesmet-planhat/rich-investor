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
        className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-60"
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
        className="border-line-strong text-ink-muted hover:bg-surface-hover w-full rounded-md border px-3 py-2 text-sm transition disabled:opacity-60"
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
      <p className="rounded-md border border-pass-line bg-pass-wash p-4 text-sm text-pass">
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
        <span className="text-ink-muted mb-1 block text-sm">
          {labels.email}
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          className="bg-surface border-line-strong w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-ink-muted mb-1 block text-sm">
          {labels.password}
        </span>
        {/* Not `required`: leaving it empty and asking for a link is a valid
            way to use this form. */}
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          className="bg-surface border-line-strong w-full rounded-md border px-3 py-2 text-sm"
        />
        <span className="text-ink-subtle mt-1 block text-xs">
          {labels.passwordHint}
        </span>
      </label>

      <Buttons labels={labels} />

      {state.status === 'error' && (
        <p className="text-sm text-fail">
          {labels.errors[state.message ?? ''] ?? labels.errors.generic}
        </p>
      )}

      <p className="text-ink-subtle text-xs">{labels.hint}</p>
    </form>
  );
}
