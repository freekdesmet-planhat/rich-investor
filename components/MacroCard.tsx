'use client';

import { useState } from 'react';
import type { MacroTone } from '@/lib/macro/fetch';

const TONE: Record<MacroTone, string> = {
  good: 'border-emerald-300 dark:border-emerald-800',
  warn: 'border-amber-400 dark:border-amber-700',
  bad: 'border-rose-400 dark:border-rose-700',
  neutral: 'border-line',
};

const VALUE_TONE: Record<MacroTone, string> = {
  good: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-300',
  bad: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-ink',
};

/** One macro metric, with the same "?" affordance the ratio cards use. */
export function MacroCard({
  name,
  help,
  value,
  tone,
  note,
  explainLabel,
}: {
  name: string;
  help: string;
  value: string;
  tone: MacroTone;
  note?: string;
  explainLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-xl border bg-surface p-3 ${TONE[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-ink-muted text-xs font-medium">{name}</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={explainLabel}
          className="border-line-strong text-ink-subtle hover:bg-surface-hover shrink-0 rounded-full border px-1.5 text-[10px] leading-4 transition"
        >
          ?
        </button>
      </div>

      <p className={`mt-1 text-xl font-semibold tabular-nums ${VALUE_TONE[tone]}`}>{value}</p>
      {note && <p className="text-ink-subtle mt-0.5 text-xs">{note}</p>}

      {open && (
        <p className="border-line text-ink-muted mt-2 border-t pt-2 text-xs leading-relaxed">
          {help}
        </p>
      )}
    </div>
  );
}
