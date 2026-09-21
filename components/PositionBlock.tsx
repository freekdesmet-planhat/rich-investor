'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { clearPosition, savePosition } from '@/app/stock/[symbol]/positionActions';
import { POSITION_IDLE, type PositionActionState } from '@/lib/positions/state';
import type { Position } from '@/lib/data/position';
import { SectionHeading } from './ui/Surface';

export interface PositionLabels {
  title: string;
  intro: string;
  add: string;
  edit: string;
  entryPrice: string;
  entryDate: string;
  quantity: string;
  quantityHint: string;
  note: string;
  save: string;
  saving: string;
  clear: string;
  clearing: string;
  cancel: string;
  since: string;
  /** Carries {days}. */
  held: string;
  value: string;
  gain: string;
  saved: string;
  cleared: string;
  errors: Record<string, string>;
}

function SubmitButton({ idle, busy, className }: { idle: string; busy: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? busy : idle}
    </button>
  );
}

const PRIMARY =
  'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover disabled:opacity-60';
const SECONDARY =
  'rounded-md border border-line-strong px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface-hover disabled:opacity-60';

/**
 * Whether you own this, and what it has done since you bought it.
 *
 * The sell-signal checklist below asks whether performance is deteriorating and
 * whether the CFO left in a hurry. Those are questions about a holding, and
 * until now nothing knew there was one — so the whole second half of the book's
 * framework was a questionnaire about a hypothetical.
 *
 * The form stays closed until there is something to say. Recording a holding is
 * optional and always will be: this is not a portfolio tracker, it is the one
 * figure the sell decision hangs on.
 */
export function PositionBlock({
  symbol,
  position,
  currency,
  summary,
  labels,
}: {
  symbol: string;
  position: Position | null;
  /** The currency the shares trade in, recorded with the entry. */
  currency: string | null;
  /** Pre-formatted on the server, where the locale and currency live. */
  summary: { change: string | null; value: string | null; gain: string | null; days: number | null } | null;
  labels: PositionLabels;
}) {
  const [saveState, saveAction] = useActionState<PositionActionState, FormData>(
    savePosition,
    POSITION_IDLE,
  );
  const [clearState, clearAction] = useActionState<PositionActionState, FormData>(
    clearPosition,
    POSITION_IDLE,
  );
  const [open, setOpen] = useState(false);

  const error =
    saveState.status === 'error'
      ? (labels.errors[saveState.reason ?? ''] ?? saveState.message ?? labels.errors.unknown)
      : null;

  // The summary is the useful state, not the form: the form opens on request
  // and the server action's revalidation brings the summary back.
  const showForm = open;

  return (
    <section className="mt-8">
      <SectionHeading>{labels.title}</SectionHeading>
      <p className="text-ink-subtle mt-1 text-sm">{labels.intro}</p>

      <div className="bg-surface border-line mt-3 rounded-lg border p-4">
        {position && !showForm && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
              {summary?.change && (
                <div>
                  <dt className="text-ink-subtle text-xs">{labels.since}</dt>
                  <dd
                    className={`text-lg font-semibold tabular-nums ${
                      summary.change.startsWith('-')
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {summary.change}
                  </dd>
                </div>
              )}
              {summary?.value && (
                <div>
                  <dt className="text-ink-subtle text-xs">{labels.value}</dt>
                  <dd className="tabular-nums">{summary.value}</dd>
                </div>
              )}
              {summary?.gain && (
                <div>
                  <dt className="text-ink-subtle text-xs">{labels.gain}</dt>
                  <dd className="tabular-nums">{summary.gain}</dd>
                </div>
              )}
              {summary?.days != null && (
                <div>
                  <dt className="text-ink-subtle text-xs">
                    {labels.held.replace('{days}', String(summary.days))}
                  </dt>
                  <dd className="text-ink-subtle tabular-nums">
                    {position.entry_date}
                  </dd>
                </div>
              )}
            </dl>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setOpen(true)} className={SECONDARY}>
                {labels.edit}
              </button>
              <form action={clearAction}>
                <input type="hidden" name="symbol" value={symbol} />
                <SubmitButton idle={labels.clear} busy={labels.clearing} className={SECONDARY} />
              </form>
            </div>
          </div>
        )}

        {position && !showForm && position.note && (
          <p className="text-ink-muted mt-3 text-sm">{position.note}</p>
        )}

        {!position && !showForm && (
          <button type="button" onClick={() => setOpen(true)} className={PRIMARY}>
            {labels.add}
          </button>
        )}

        {showForm && (
          <form action={saveAction} className="space-y-3">
            <input type="hidden" name="symbol" value={symbol} />
            <input type="hidden" name="currency" value={currency ?? ''} />

            <div className="flex flex-wrap gap-3">
              <label className="block">
                <span className="text-ink-subtle text-xs">
                  {labels.entryPrice}
                  {currency ? ` (${currency})` : ''}
                </span>
                <input
                  name="entry_price"
                  inputMode="decimal"
                  required
                  defaultValue={position?.entry_price ?? ''}
                  className="border-line-strong mt-1 block w-32 rounded-md border bg-white px-3 py-2 text-sm bg-canvas"
                />
              </label>
              <label className="block">
                <span className="text-ink-subtle text-xs">{labels.entryDate}</span>
                <input
                  name="entry_date"
                  type="date"
                  required
                  defaultValue={position?.entry_date ?? ''}
                  className="border-line-strong mt-1 block rounded-md border bg-white px-3 py-2 text-sm bg-canvas"
                />
              </label>
              <label className="block">
                <span className="text-ink-subtle text-xs">{labels.quantity}</span>
                <input
                  name="quantity"
                  inputMode="decimal"
                  defaultValue={position?.quantity ?? ''}
                  className="border-line-strong mt-1 block w-28 rounded-md border bg-white px-3 py-2 text-sm bg-canvas"
                />
                <span className="text-ink-faint mt-1 block text-xs">
                  {labels.quantityHint}
                </span>
              </label>
            </div>

            <label className="block">
              <span className="text-ink-subtle text-xs">{labels.note}</span>
              <textarea
                name="note"
                rows={2}
                defaultValue={position?.note ?? ''}
                className="border-line-strong mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm bg-canvas"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton idle={labels.save} busy={labels.saving} className={PRIMARY} />
              <button type="button" onClick={() => setOpen(false)} className={SECONDARY}>
                {labels.cancel}
              </button>
              {error && <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>}
            </div>
          </form>
        )}

        <p role="status" aria-live="polite" className="mt-2 text-xs">
          {saveState.status === 'saved' && (
            <span className="text-emerald-700 dark:text-emerald-300">{labels.saved}</span>
          )}
          {clearState.status === 'cleared' && (
            <span className="text-ink-subtle">{labels.cleared}</span>
          )}
        </p>
      </div>
    </section>
  );
}
