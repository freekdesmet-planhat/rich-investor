/**
 * Five years of closing prices, with the 5-year high marked and the current
 * drawdown from it shown (section 3.4, section 5.18).
 *
 * Inline SVG rather than a charting library: it is one series, it has to render
 * on the server, and the page stays self-contained.
 */
export function PriceChart({
  points,
  high,
  highDate,
  currency,
  labels,
}: {
  points: Array<{ date: string; close: number }>;
  high: number | null;
  highDate: string | null;
  currency: string | null;
  labels: { high: string; now: string; drawdown: string };
}) {
  if (points.length < 2) return null;

  // One point per trading day over five years is far more than the width can
  // resolve; sampling keeps the path small without changing its shape.
  const maxPoints = 320;
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const width = 720;
  const height = 200;
  const padding = { top: 12, right: 8, bottom: 20, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const closes = sampled.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes, high ?? -Infinity);
  const span = max - min || 1;

  const x = (i: number) => padding.left + (i / (sampled.length - 1)) * innerW;
  const y = (value: number) => padding.top + innerH - ((value - min) / span) * innerH;

  const line = sampled.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
  const area = `${line} L${x(sampled.length - 1).toFixed(1)},${padding.top + innerH} L${padding.left},${padding.top + innerH} Z`;

  const last = sampled[sampled.length - 1];
  const highY = high != null ? y(high) : null;
  const drawdown = high != null && high > 0 ? last.close / high - 1 : null;

  const fmt = (v: number) =>
    `${currency ? `${currency} ` : ''}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full sm:h-56"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${labels.high} ${high != null ? fmt(high) : ''}`}
      >
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {highY != null && (
          <g>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={highY}
              y2={highY}
              strokeDasharray="4 4"
              className="stroke-amber-500/70"
              strokeWidth="1"
            />
            <text
              x={padding.left + 4}
              y={highY - 4}
              className="fill-amber-600 text-[10px] dark:fill-amber-400"
            >
              {labels.high} {fmt(high!)}
              {highDate ? ` · ${highDate.slice(0, 7)}` : ''}
            </text>
          </g>
        )}

        <g className="text-sky-600 dark:text-sky-400">
          <path d={area} fill="url(#priceFill)" />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </g>

        <circle cx={x(sampled.length - 1)} cy={y(last.close)} r="3" className="fill-sky-600 dark:fill-sky-400" />
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {sampled[0].date} — {last.date}
        </span>
        <span>
          {labels.now} <span className="tabular-nums">{fmt(last.close)}</span>
        </span>
        {drawdown != null && (
          <span className={drawdown <= -0.5 ? 'font-medium text-emerald-600 dark:text-emerald-400' : ''}>
            {labels.drawdown}{' '}
            <span className="tabular-nums">{`${(drawdown * 100).toFixed(1)}%`}</span>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
