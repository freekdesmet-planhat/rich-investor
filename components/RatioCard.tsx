'use client';

import { useState } from 'react';
import { ColorDot } from './ColorDot';
import { Sparkline } from './Sparkline';

export interface RatioCardProps {
  ratioKey: string;
  /** Localised name, target and explanation, from docs/ratios.<lang>.md. */
  name: string;
  explanation: string;
  /** Pre-formatted in the active locale by the server component. */
  displayValue: string;
  color: string;
  targetLabel: string;
  targetSourceLabel: string;
  history: Array<{ period: string; value: number }>;
  unavailableLabel: string | null;
  /** Set when the value shown is an adjusted figure (payment-processor ROA). */
  adjusted?: {
    rawDisplayValue: string;
    rawLabel: string;
    adjustedLabel: string;
    note: string;
    approximationNote: string | null;
  } | null;
  labels: { explain: string; target: string; fiveYears: string; close: string };
}

/**
 * One ratio, with the "?" button that opens its explanation (section 5).
 *
 * The explanation text is passed in already localised — this component never
 * holds copy of its own, so the markdown files stay the single source.
 */
export function RatioCard({
  name,
  explanation,
  displayValue,
  color,
  targetLabel,
  targetSourceLabel,
  history,
  unavailableLabel,
  adjusted,
  labels,
}: RatioCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ColorDot color={color} label={color} />
          <h3 className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
            {name}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={labels.explain}
          className="shrink-0 rounded-full border border-slate-300 px-1.5 text-xs leading-5 text-slate-500 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          ?
        </button>
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {displayValue}
          </p>
          {unavailableLabel && (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{unavailableLabel}</p>
          )}
        </div>
        <Sparkline points={history} />
      </div>

      {adjusted && (
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
          <p className="flex items-center justify-between gap-2">
            {/* The raw figure stays visible, greyed out, beside the adjusted one. */}
            <span className="text-slate-400 line-through dark:text-slate-500">
              {adjusted.rawLabel} {adjusted.rawDisplayValue}
            </span>
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {adjusted.adjustedLabel}
            </span>
          </p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{adjusted.note}</p>
          {adjusted.approximationNote && (
            <p className="mt-1 text-slate-500 dark:text-slate-400">
              {adjusted.approximationNote}
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {labels.target}: {targetLabel}{' '}
        <span className="text-slate-400 dark:text-slate-500">({targetSourceLabel})</span>
      </p>

      {open && (
        <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {explanation}
          </p>
          {history.length > 1 && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              {labels.fiveYears}:{' '}
              {history.map((p) => p.period.slice(0, 4)).join(' · ')}
            </p>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 text-xs text-slate-500 underline dark:text-slate-400"
          >
            {labels.close}
          </button>
        </div>
      )}
    </div>
  );
}
