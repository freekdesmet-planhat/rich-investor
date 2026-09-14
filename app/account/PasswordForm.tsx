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
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
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
        <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
          {labels.newPassword}
        </span>
        <input
          type="password"
          name="password"
          required
          minLength={10}
          autoComplete="new-password"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-slate-600 dark:text-slate-300">
          {labels.confirm}
        </span>
        <input
          type="password"
          name="confirm"
          required
          minLength={10}
          autoComplete="new-password"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
      </label>

      <SaveButton labels={labels} />

      {state.status === 'saved' && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{labels.saved}</p>
      )}
      {state.status === 'error' && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {labels.errors[state.message ?? ''] ?? labels.errors.generic}
        </p>
      )}
    </form>
  );
}
