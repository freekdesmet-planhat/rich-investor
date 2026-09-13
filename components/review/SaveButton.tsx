'use client';

import { useFormStatus } from 'react-dom';

export function SaveButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
    >
      {pending ? busy : idle}
    </button>
  );
}
