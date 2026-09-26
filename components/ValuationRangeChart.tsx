import type { ValuationRange } from '@/lib/ratios/valuationHistory';

/**
 * The company's own P/E over five years, with today marked on it.
 *
 * The drawdown condition already says how far the price has fallen from its
 * own high. That is a fact about the price alone: a company whose earnings
 * doubled can be well off its high and still more expensive than it has ever
 * been. This is the other half of the question — cheap against its own
 * history, not just against its own peak.
 *
 * A server component. There is nothing to interact with: the line, the
 * median and the current marker are the whole idea, and a tooltip would add
 * a client bundle to a figure that is read at a glance.
 *
 * Steps rather than curves are expected and correct — see valuationHistory.ts
 * for why the denominator only moves once a year.
 */
export function ValuationRangeChart({
  range,
  labels,
}: {
  range: ValuationRange;
  labels: {
    current: string;
    median: string;
    low: string;
    high: string;
    /** Carries {percentile}. */
    percentileCheap: string;
    percentileRich: string;
    footnote: string;
  };
}) {
  const width = 640;
  const height = 132;
  const padding = { top: 10, right: 44, bottom: 16, left: 8 };

  const { points, min, max, median, current, percentile } = range;

  // A little headroom so the line never touches the frame, and so the
  // current marker has somewhere to sit when today is the extreme.
  const lo = Math.min(min, current ?? min);
  const hi = Math.max(max, current ?? max);
  const pad = (hi - lo) * 0.08 || 1;
  const top = hi + pad;
  const bottom = Math.max(0, lo - pad);

  const firstTime = new Date(points[0].date).getTime();
  const lastTime = new Date(points[points.length - 1].date).getTime();
  const span = Math.max(1, lastTime - firstTime);

  const x = (date: string) =>
    padding.left +
    ((new Date(date).getTime() - firstTime) / span) * (width - padding.left - padding.right);
  const y = (value: number) =>
    padding.top +
    (1 - (value - bottom) / Math.max(1e-9, top - bottom)) * (height - padding.top - padding.bottom);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(1)},${y(p.pe).toFixed(1)}`).join(' ');

  const number = (value: number) => value.toFixed(1);

  return (
    <figure className="mt-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-32 w-full text-accent"
        // Without this the SVG letterboxes itself to its own aspect ratio and
        // sits marooned in the middle of a full-width card. The price chart
        // above has always done the same; strokes below are told not to scale
        // with it so the stretch does not thin the line.
        preserveAspectRatio="none"
        role="img"
        aria-label={`${labels.current} ${current != null ? number(current) : '—'}, ${labels.median} ${number(median)}, ${labels.low} ${number(min)}, ${labels.high} ${number(max)}`}
      >
        {/* The median, as the thing the line is being compared against. */}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={y(median)}
          y2={y(median)}
          className="stroke-line-strong"
          strokeWidth="1"
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        <text x={width - padding.right + 6} y={y(median) + 3} className="fill-ink-faint text-[10px]">
          {number(median)}
        </text>

        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />

        {/* Today. The one value the reader came for. */}
        {current != null && (
          <>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(current)}
              y2={y(current)}
              className="stroke-ink"
              strokeWidth="1"
              strokeOpacity="0.35"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={x(points[points.length - 1].date)}
              cy={y(current)}
              r="3.5"
              className="fill-ink"
            />
            <text
              x={width - padding.right + 6}
              y={y(current) + 3}
              className="fill-ink text-[10px] font-semibold"
            >
              {number(current)}
            </text>
          </>
        )}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-ink-subtle">
        <span>
          {labels.low}{' '}
          <span className="font-medium tabular-nums text-ink-muted">{number(min)}</span>
        </span>
        <span>
          {labels.median}{' '}
          <span className="font-medium tabular-nums text-ink-muted">{number(median)}</span>
        </span>
        <span>
          {labels.high}{' '}
          <span className="font-medium tabular-nums text-ink-muted">{number(max)}</span>
        </span>
        {percentile != null && (
          // Low is the interesting direction, so it gets the emphasis and the
          // pass colour; expensive-against-itself is stated plainly and left
          // neutral, because it is context and not a verdict.
          <span className={percentile <= 25 ? 'font-medium text-pass' : 'text-ink-muted'}>
            {/* `percentile` is the share of history at or below today's multiple.
                So the days it is cheaper *than* is the complement, and the days it
                is richer than is the percentile itself — the figure each sentence
                names is "% of days it is lower/higher than". */}
            {(percentile <= 50 ? labels.percentileCheap : labels.percentileRich).replace(
              '{percentile}',
              String(Math.round(percentile <= 50 ? 100 - percentile : percentile)),
            )}
          </span>
        )}
      </figcaption>
      <p className="mt-1 text-xs text-ink-faint">{labels.footnote}</p>
    </figure>
  );
}
