/**
 * Which PEG carried the valuation test.
 *
 * The condition passes on either the trailing figure or the forward one, and
 * the difference is the difference between "it is cheap against what it has
 * earned" and "it is cheap against what analysts expect it to earn" — the
 * second of which the book is explicitly sceptical of. The detail page said so
 * in a caption under one card; the watchlist did not say so at all, so a row
 * passing on estimates alone was indistinguishable from one passing on
 * delivered earnings.
 *
 * Only 'forward' is worth interrupting a row for: passing on trailing earnings
 * is the unremarkable case, and a badge on every row would say nothing.
 */
export type PegBasis = 'trailing' | 'forward' | 'both' | 'none' | null;

export function PegBasisBadge({
  basis,
  label,
  title,
  compact = false,
}: {
  basis: PegBasis;
  label: string;
  /** The longer explanation, shown on hover and to assistive tech. */
  title: string;
  compact?: boolean;
}) {
  if (basis !== 'forward') return null;

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 font-medium text-amber-900 ring-1 ring-inset ring-amber-600/30 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-400/30 ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <span aria-hidden="true">⌁</span>
      {label}
      <span className="sr-only">. {title}</span>
    </span>
  );
}
