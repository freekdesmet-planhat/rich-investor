import type { PeerSummary } from '@/lib/data/peerComparison';
import { higherIsBetter } from '@/lib/data/peerComparison';

/**
 * The company's key figures beside the others on the watchlist in its sector.
 *
 * Read peerComparison.ts before changing the copy: this is deliberately not
 * called a sector median, because it is not one.
 *
 * Differences are coloured by whether the direction is favourable for that
 * particular metric, not by sign — a high multiple and a high return on
 * equity are not the same kind of fact. Colour here is decoration on a
 * number that is already stated; nothing about it feeds a verdict.
 */
export function PeerComparison({
  summary,
  labels,
  format,
}: {
  summary: PeerSummary;
  labels: {
    yours: string;
    median: string;
    difference: string;
    above: string;
    below: string;
    level: string;
    metric: Record<string, string>;
  };
  /** Rendered by the page, which owns locale and per-metric units. */
  format: (metric: string, value: number) => string;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs text-ink-subtle">
          <th scope="col" className="pb-2 font-medium">
            {' '}
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            {labels.yours}
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            {labels.median}
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            {labels.difference}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {summary.comparisons.map((c) => {
          const rounded = Math.round(Math.abs(c.differencePercent));
          // Under a point of difference is noise, not a finding.
          const flat = rounded < 1;
          const favourable = higherIsBetter(c.metric) === c.differencePercent > 0;

          return (
            <tr key={c.metric}>
              <th scope="row" className="py-2 text-left font-normal text-ink-muted">
                {labels.metric[c.metric] ?? c.metric}
              </th>
              <td className="py-2 text-right font-medium tabular-nums text-ink">
                {format(c.metric, c.own)}
              </td>
              <td className="py-2 text-right tabular-nums text-ink-muted">
                {format(c.metric, c.median)}
              </td>
              <td
                className={`py-2 text-right tabular-nums ${
                  flat ? 'text-ink-subtle' : favourable ? 'text-pass' : 'text-near'
                }`}
              >
                {flat
                  ? labels.level
                  : (c.differencePercent > 0 ? labels.above : labels.below).replace(
                      '{percent}',
                      String(rounded),
                    )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
