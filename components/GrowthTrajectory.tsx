import type { Trajectory } from '@/lib/ratios/trajectory';
import { Card, Section, SectionHeading } from './ui/Surface';

export interface GrowthTrajectoryLabels {
  title: string;
  intro: string;
  /** Carries {range}, the first and last fiscal year the fit covers. */
  fitted: string;
  /** Carries {rate}. */
  endpoint: string;
  /** Carries {count}; the years earnings fell. */
  dips: string;
  steady: string;
  /** Carries {band}, the translated growth-category name. */
  band: string;
  eps: string;
  yoy: string;
  curve: string;
  noFit: string;
}

/**
 * The earnings series behind the growth category.
 *
 * The page states a category and a single fitted rate, and neither describes
 * the shape underneath. Twelve percent a year compounding steadily and twelve
 * percent averaged across a collapse and a recovery wear the same label and
 * call for opposite decisions — the first is a stalwart, the second is the dip
 * the book tells you to read before acting. So the bars are the actual
 * earnings, the line is the fit that produced the label, and the years earnings
 * fell are marked rather than averaged away.
 *
 * Inline SVG on the server, like the price chart: one short series, no library,
 * and it renders without JavaScript.
 */
export function GrowthTrajectory({
  trajectory,
  formatPercent,
  formatNumber,
  bandName,
  labels,
}: {
  trajectory: Trajectory;
  formatPercent: (value: number | null) => string;
  formatNumber: (value: number | null) => string;
  bandName: string | null;
  labels: GrowthTrajectoryLabels;
}) {
  const { points } = trajectory;
  if (points.length < 2) return null;

  const width = 640;
  const height = 160;
  const padding = { top: 14, right: 12, bottom: 28, left: 12 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  // The baseline is zero, or the deepest loss, so a bar that went negative
  // reads as below the line rather than being clipped out of the chart.
  const values = points.map((p) => p.value);
  const fittedValues = points.map((p) => p.fitted).filter((v): v is number => v != null);
  const max = Math.max(...values, ...fittedValues, 0);
  const min = Math.min(...values, ...fittedValues, 0);
  const span = max - min || 1;

  const slot = innerW / points.length;
  const barWidth = Math.min(slot * 0.55, 46);
  const centre = (i: number) => padding.left + slot * (i + 0.5);
  const y = (value: number) => padding.top + innerH - ((value - min) / span) * innerH;
  const zeroY = y(0);

  const curve = points
    .map((p, i) => (p.fitted == null ? null : `${centre(i).toFixed(1)},${y(p.fitted).toFixed(1)}`))
    .filter((c): c is string => c != null);

  return (
    <Section>
      <SectionHeading>{labels.title}</SectionHeading>
      <p className="-mt-1 mb-3 text-sm text-ink-subtle">{labels.intro}</p>

      <Card padding="tight">
        {/* Wraps to a column on a phone rather than squeezing four figures
            into a single line of two-character abbreviations. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Figure
            // The range rather than a count of observations: six annual points
            // span five years of growth, and "6 years" beside a rate fitted
            // over five is the kind of small lie this panel exists to remove.
            label={labels.fitted.replace(
              '{range}',
              `${points[0].period.slice(0, 4)}–${points[points.length - 1].period.slice(0, 4)}`,
            )}
            value={formatPercent(trajectory.rate)}
            strong
          />
          <Figure label={labels.endpoint} value={formatPercent(trajectory.endpointCagr)} />
          <Figure
            label={labels.dips.replace('{count}', String(trajectory.dips))}
            value={trajectory.dips === 0 ? labels.steady : formatPercent(trajectory.worstDip)}
          />
          <Figure label={labels.band} value={bandName ?? '—'} />
        </dl>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mt-3 h-40 w-full"
          role="img"
          aria-label={labels.curve}
          preserveAspectRatio="none"
        >
          {/* Zero line, so a loss year is visibly below it. */}
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={zeroY}
            y2={zeroY}
            className="stroke-line"
            strokeWidth="1"
          />

          {points.map((point, i) => {
            const top = Math.min(y(point.value), zeroY);
            const barHeight = Math.abs(y(point.value) - zeroY) || 1;
            return (
              <rect
                key={point.period}
                x={centre(i) - barWidth / 2}
                y={top}
                width={barWidth}
                height={barHeight}
                rx="2"
                className={
                  point.dip
                    ? 'fill-fail'
                    : 'fill-line'
                }
              />
            );
          })}

          {curve.length > 1 && (
            <polyline
              points={curve.join(' ')}
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-pass"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {points.map((point, i) => (
            <text
              key={point.period}
              x={centre(i)}
              y={height - 8}
              textAnchor="middle"
              className="fill-ink-faint text-[11px]"
            >
              {point.period.slice(0, 4)}
            </text>
          ))}
        </svg>

        {/* The numbers themselves, because a bar chart cannot be read to the
            cent and this is the table the chart is a picture of. It also keeps
            the panel usable when the SVG is too narrow to label. */}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-xs">
            <thead className="text-ink-faint">
              <tr>
                <th className="py-1 pr-3 font-normal">{''}</th>
                {points.map((p) => (
                  <th key={p.period} className="py-1 pr-3 text-right font-normal tabular-nums">
                    {p.period.slice(0, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              <tr>
                <th scope="row" className="py-1 pr-3 font-normal">
                  {labels.eps}
                </th>
                {points.map((p) => (
                  <td key={p.period} className="py-1 pr-3 text-right tabular-nums">
                    {formatNumber(p.value)}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="py-1 pr-3 font-normal">
                  {labels.yoy}
                </th>
                {points.map((p) => (
                  <td
                    key={p.period}
                    className={`py-1 pr-3 text-right tabular-nums ${
                      p.dip ? 'text-fail' : ''
                    }`}
                  >
                    {p.yoy == null ? '—' : formatPercent(p.yoy)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {trajectory.rate == null && (
          <p className="text-ink-subtle mt-2 text-xs">{labels.noFit}</p>
        )}
      </Card>
    </Section>
  );
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-subtle text-xs">{label}</dt>
      <dd
        className={`tabular-nums ${
          strong
            ? 'text-lg font-semibold text-ink'
            : 'text-sm text-ink-muted'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
