'use client';

import { useEffect, useRef, useState } from 'react';
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
  /** What the colour dot means, for assistive tech: "Met" / "Not met" / "Can't judge" (item 6). */
  statusLabel: string;
  targetLabel: string;
  targetSourceLabel: string;
  /**
   * Set where the buy-worthy checklist passes on a looser number than the
   * healthy target above it, so the card cannot appear to contradict the
   * checklist. Both numbers come from the same threshold constant.
   */
  gateLabel?: string | null;
  /**
   * Extra figures behind the headline one, each already formatted and labelled.
   *
   * PEG needs this: the condition may pass on expected growth while the
   * trailing figure fails, and a card showing one number with a red dot next to
   * a checklist row with a green tick told the reader nothing about which
   * applied.
   */
  variants?: Array<{ label: string; value: string; used: boolean }> | null;
  /** A short line under the value, e.g. which basis carried the condition. */
  caption?: string | null;
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
  /**
   * Where this metric's figures came from, and when.
   *
   * The footer named the providers for the whole page, which told the reader
   * nothing about any particular number. This is per metric, in the dialog
   * that already exists to explain it.
   */
  provenance?: { sources: string[]; asOf: string } | null;
  labels: {
    explain: string;
    target: string;
    fiveYears: string;
    close: string;
    /** Carries {sources} and {date}. */
    source: string;
  };
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
  statusLabel,
  targetLabel,
  targetSourceLabel,
  gateLabel,
  variants,
  caption,
  history,
  unavailableLabel,
  adjusted,
  provenance,
  labels,
}: RatioCardProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal() cannot be set declaratively, so the state drives it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <div className="bg-surface border-line rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <ColorDot color={color} label={statusLabel} />
          {/* Wraps rather than truncates: the name is the only thing saying
              which ratio this card is, and "Operating cash flow / net inc…"
              is not a thing you can look up. */}
          <h3 className="min-w-0 text-sm font-medium text-ink-muted">
            {name}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={labels.explain}
          className="border-line-strong text-ink-subtle hover:bg-surface-hover shrink-0 rounded-full border px-1.5 text-xs leading-5 transition"
        >
          ?
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="break-words text-2xl font-semibold tabular-nums text-ink">
            {displayValue}
          </p>
          {unavailableLabel && (
            <p className="mt-0.5 text-xs text-ink-subtle">{unavailableLabel}</p>
          )}
          {variants && variants.length > 0 && (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs">
              {variants.map((variant) => (
                <span
                  key={variant.label}
                  className={
                    variant.used
                      ? 'font-medium text-ink-muted'
                      : 'text-ink-faint'
                  }
                >
                  {variant.label}{' '}
                  <span className="tabular-nums">{variant.value}</span>
                </span>
              ))}
            </p>
          )}
          {caption && (
            <p className="mt-1 text-xs text-ink-subtle">{caption}</p>
          )}
        </div>
        <Sparkline points={history} />
      </div>

      {adjusted && (
        <div className="bg-surface-sunken border-line mt-2 rounded border p-2 text-xs">
          <p className="flex flex-wrap items-center justify-between gap-2">
            {/* The raw figure stays visible, greyed out, beside the adjusted one. */}
            <span className="text-ink-faint line-through">
              {adjusted.rawLabel} {adjusted.rawDisplayValue}
            </span>
            <span className="font-medium text-ink-muted">
              {adjusted.adjustedLabel}
            </span>
          </p>
          <p className="mt-1 text-ink-subtle">{adjusted.note}</p>
          {adjusted.approximationNote && (
            <p className="mt-1 text-ink-subtle">
              {adjusted.approximationNote}
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-ink-subtle">
        {labels.target}: {targetLabel}{' '}
        <span className="text-ink-subtle">({targetSourceLabel})</span>
      </p>
      {gateLabel && (
        <p className="mt-0.5 text-xs text-ink-subtle">{gateLabel}</p>
      )}

      {/* The explanation opens in a modal dialog rather than inside the card.
          Expanding in place added ~400px to one cell, which stretched the two
          cards beside it into tall empty boxes and pushed everything below down
          a screen. A dialog is outside the grid, so the layout does not move,
          and the platform gives Escape, a focus trap and a backdrop for free. */}
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // A click on the dialog element itself is the backdrop: its children
          // are the panel, so anything inside stops here.
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="bg-surface border-line text-ink m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border p-0 shadow-raised backdrop:bg-black/50"
      >
        <div className="max-h-[80vh] overflow-y-auto p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <h3 className="text-sm font-medium text-ink-muted">{name}</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label={labels.close}
              className="text-ink-subtle hover:bg-surface-hover -mr-1 -mt-1 shrink-0 rounded px-2 py-1 transition"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-ink-subtle">
            {labels.target}: {targetLabel}{' '}
            <span className="text-ink-subtle">({targetSourceLabel})</span>
          </p>

          {/* One <p> per paragraph, rather than `whitespace-pre-line` over the
              whole thing. The source is hard-wrapped for an editor and those
              newlines are what made the text ragged; the blank lines between
              paragraphs are real, and become spacing rather than a line break. */}
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-muted">
            {explanation
              .split('\n\n')
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
          </div>

          {history.length > 1 && (
            <p className="mt-3 text-xs text-ink-subtle">
              {/* The count is derived, not fixed at five — the window often holds four
                  annual points, and "5 years: 2022 · 2023 · 2024 · 2025" was wrong. */}
              {labels.fiveYears.replace('{count}', String(history.length))}:{' '}
              {history.map((p) => p.period.slice(0, 4)).join(' · ')}
            </p>
          )}

          {provenance && provenance.sources.length > 0 && (
            <p className="mt-2 text-xs text-ink-subtle">
              {labels.source
                .replace('{sources}', provenance.sources.join(', '))
                .replace('{date}', provenance.asOf)}
            </p>
          )}
        </div>
      </dialog>

    </div>
  );
}
