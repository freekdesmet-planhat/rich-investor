'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { togglePriceAlert, type WatchlistActionState } from '@/app/watchlist/actions';

export interface PriceAlertLabels {
  /** "Passes below €201.31", already formatted. */
  passes: string;
  checkedNightly: string;
  subscribe: string;
  subscribed: string;
  turnOff: string;
}

function SubmitButton({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {label}
    </button>
  );
}

/**
 * The entry-price trigger and its opt-in email (launch item 10).
 *
 * Shown only where the 50% decline is a stock's one remaining condition, so the
 * price it passes at is a real, single number. The toggle writes the shared
 * watchlist flag the nightly price pass reads; the state comes from the action
 * result, seeded by the server so it is right on first paint.
 */
export function PriceAlertToggle({
  symbol,
  on,
  labels,
}: {
  symbol: string;
  on: boolean;
  labels: PriceAlertLabels;
}) {
  const [state, action] = useActionState<WatchlistActionState, FormData>(togglePriceAlert, {
    status: 'idle',
  });
  // The action returns 'added' when turned on and 'removed' when off; before any
  // click, the server-rendered prop stands.
  const subscribed =
    state.status === 'added' ? true : state.status === 'removed' ? false : on;

  return (
    <div className="border-line bg-surface-sunken mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2">
      <p className="text-sm text-ink-muted">
        <span className="font-medium text-ink">{labels.passes}</span>
        <span className="text-ink-subtle"> · {labels.checkedNightly}</span>
      </p>
      <form action={action}>
        <input type="hidden" name="symbol" value={symbol} />
        <input type="hidden" name="on" value={subscribed ? 'false' : 'true'} />
        {subscribed ? (
          <span className="text-ink-subtle flex items-center gap-2 text-xs">
            {labels.subscribed}
            <SubmitButton
              label={labels.turnOff}
              className="text-ink-muted underline underline-offset-2 disabled:opacity-60"
            />
          </span>
        ) : (
          <SubmitButton
            label={labels.subscribe}
            className="border-line-strong text-ink-muted hover:bg-surface-hover rounded-md border px-3 py-1.5 text-sm transition disabled:opacity-60"
          />
        )}
      </form>
    </div>
  );
}
