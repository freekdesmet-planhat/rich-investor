import type { DataQuality } from '@/lib/data/dataQuality';

export interface DataQualityLabels {
  /** Carries {conditions}. */
  unmeasured: string;
  /** Carries {conditions}. */
  approximated: string;
  stale: string;
  condition: (key: string) => string;
}

/**
 * Which parts of the verdict below rested on figures that were not there.
 *
 * The checklist shows nine ticks and crosses of equal weight. A cross against a
 * condition the providers could not supply a number for means something quite
 * different from a cross against one that was measured and failed, and until
 * now the page drew them identically. This says the difference out loud, above
 * the checklist it applies to.
 *
 * Renders nothing when there is nothing to say — which is most of the time, and
 * is what keeps it worth reading when it does appear.
 */
export function DataQualityNotice({
  quality,
  labels,
}: {
  quality: DataQuality;
  labels: DataQualityLabels;
}) {
  if (!quality.hasIssues) return null;

  const list = (keys: string[]) => keys.map(labels.condition).join(', ');

  return (
    <div
      role="note"
      className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <ul className="space-y-1">
        {quality.unmeasured.length > 0 && (
          <li>{labels.unmeasured.replace('{conditions}', list(quality.unmeasured))}</li>
        )}
        {quality.approximated.length > 0 && (
          <li>{labels.approximated.replace('{conditions}', list(quality.approximated))}</li>
        )}
        {quality.isStale && <li>{labels.stale}</li>}
      </ul>
    </div>
  );
}
