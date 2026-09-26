import { freshnessOf, relativeAge } from '@/lib/data/freshness';

export interface FreshnessLabels {
  updated: string;
  justNow: string;
  hoursAgo: string;
  daysAgo: string;
  stale: string;
  veryStale: string;
  asOf: string;
}

/**
 * How old the figures are, and a warning when they have stopped arriving.
 *
 * A bare "As of 2026-09-13" reads the same whether the nightly job ran last
 * night or died a fortnight ago, which is precisely the failure it needs to
 * surface: nothing else in the app would tell you the pipeline had stopped.
 */
export function DataFreshness({
  asOf,
  labels,
  now,
  warningOnly = false,
}: {
  asOf: string | null | undefined;
  labels: FreshnessLabels;
  /** Injectable so a test does not depend on the wall clock. */
  now?: Date;
  /**
   * Render the warning and nothing else.
   *
   * Used at the top of a page, where a healthy pipeline should say nothing at
   * all — the age still belongs in the footer, but a banner that appears every
   * day to report that everything is fine is a banner nobody reads.
   */
  warningOnly?: boolean;
}) {
  const { ageHours, isStale, isVeryStale } = freshnessOf(asOf, now);
  if (!asOf) return null;

  const age = relativeAge(ageHours, {
    justNow: labels.justNow,
    hours: labels.hoursAgo,
    days: labels.daysAgo,
  });

  if (isStale) {
    const message = (isVeryStale ? labels.veryStale : labels.stale)
      .replace('{age}', age ?? '')
      .replace('{date}', asOf);

    return (
      <p
        role="status"
        className={
          isVeryStale
            ? 'mb-4 rounded border border-fail-line bg-fail-wash px-3 py-2 text-sm text-fail'
            : 'mb-4 rounded border border-near-line bg-near-wash px-3 py-2 text-sm text-near'
        }
      >
        {message}
      </p>
    );
  }

  if (warningOnly) return null;

  return (
    <p className="text-ink-subtle text-xs">
      {labels.updated.replace('{age}', age ?? '')}
      <span className="ml-2 text-ink-subtle">{labels.asOf}</span>
    </p>
  );
}
