'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { setPassword, type PasswordState } from '@/app/login/actions';

export interface PasswordLabels {
  newPassword: string;
  confirm: string;
  save: string;
  saving: string;
  saved: string;
  errors: Record<string, string>;
}

function SaveButton({ labels }: { labels: PasswordLabels }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? labels.saving : labels.save}
    </button>
  );
}

export function PasswordForm({ labels }: { labels: PasswordLabels }) {
  const [state, action] = useActionState<PasswordState, FormData>(setPassword, {
    status: 'idle',
  });

  return (
    <form action={action} className="space-y-3">
      <label className="block">
        <span className="text-ink-muted mb-1 block text-sm">
          {labels.newPassword}
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="bg-surface border-line-strong w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-ink-muted mb-1 block text-sm">
          {labels.confirm}
        </span>
        <input
          type="password"
          name="confirm"
          required
          minLength={10}
          autoComplete="new-password"
          className="bg-surface border-line-strong w-full rounded-md border px-3 py-2 text-sm"
        />
      </label>

      <SaveButton labels={labels} />

      {state.status === 'saved' && (
        <p className="text-sm text-pass">{labels.saved}</p>
      )}
      {state.status === 'error' && (
        <p className="text-sm text-fail">
          {labels.errors[state.message ?? ''] ?? labels.errors.generic}
        </p>
      )}
    </form>
  );
}
