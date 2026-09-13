'use client';

import { useState } from 'react';
import type { MacroTone } from '@/lib/macro/fetch';

const TONE: Record<MacroTone, string> = {
  good: 'border-emerald-300 dark:border-emerald-800',
  warn: 'border-amber-400 dark:border-amber-700',
  bad: 'border-rose-400 dark:border-rose-700',
  neutral: 'border-slate-200 dark:border-slate-800',
};

const VALUE_TONE: Record<MacroTone, string> = {
  good: 'text-emerald-700 dark:text-emerald-300',
  warn: 'text-amber-700 dark:text-amber-300',
  bad: 'text-rose-700 dark:text-rose-300',
  neutral: 'text-slate-900 dark:text-slate-50',
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
    <div className={`rounded-lg border bg-white p-3 dark:bg-slate-900 ${TONE[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-300">{name}</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={explainLabel}
          className="shrink-0 rounded-full border border-slate-300 px-1.5 text-[10px] leading-4 text-slate-500 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          ?
        </button>
      </div>

      <p className={`mt-1 text-xl font-semibold tabular-nums ${VALUE_TONE[tone]}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{note}</p>}

      {open && (
        <p className="mt-2 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:text-slate-300">
          {help}
        </p>
      )}
    </div>
  );
}
