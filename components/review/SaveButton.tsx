'use client';

import { useFormStatus } from 'react-dom';

export function SaveButton({ idle, busy }: { idle: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink transition hover:bg-primary-hover disabled:opacity-60"
    >
      {pending ? busy : idle}
    </button>
  );
}
