/**
 * The verdict, as a ring of dots and one headline for the state.
 *
 * The stock page now leads with the verdict and the checklist rather than the
 * chart (launch item 8). One dot per applicable condition — nine for most
 * companies, seven for a bank where cash flow and leverage do not apply — filled
 * for the ones met and coloured by the verdict, with the count in the middle and
 * a single headline beside it. It replaces the plain status pill at the top of
 * the page; the pill still travels with rows and search results.
 */
const TONE: Record<string, { dot: string; ring: string; text: string }> = {
  buy_worthy: { dot: 'fill-[var(--pass)]', ring: 'stroke-[var(--pass-line)]', text: 'text-pass' },
  almost: { dot: 'fill-[var(--near)]', ring: 'stroke-[var(--near-line)]', text: 'text-near' },
  watching: { dot: 'fill-[var(--none)]', ring: 'stroke-[var(--none-line)]', text: 'text-none' },
};

export function VerdictRing({
  status,
  met,
  total,
  headline,
  conditionsMet,
}: {
  status: string;
  met: number;
  /** Applicable conditions — the number of dots. */
  total: number;
  /** One line for the state, e.g. "Checklist complete: now it's your research". */
  headline: string;
  /** "8 of 9 conditions met", already localised. */
  conditionsMet: string;
}) {
  const tone = TONE[status] ?? TONE.watching;
  const size = 72;
  const c = size / 2;
  const radius = c - 8;
  const dots = Array.from({ length: total }, (_, i) => {
    // Start at the top and go clockwise, so the filled arc reads like progress.
    const angle = -Math.PI / 2 + (i / total) * 2 * Math.PI;
    return {
      x: c + radius * Math.cos(angle),
      y: c + radius * Math.sin(angle),
      filled: i < met,
    };
  });

  return (
    <div className="flex items-center gap-4">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={conditionsMet}
        className="shrink-0"
      >
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={4}
            className={d.filled ? tone.dot : 'fill-[var(--line-strong)]'}
          />
        ))}
        <text
          x={c}
          y={c}
          textAnchor="middle"
          dominantBaseline="central"
          className={`fill-current text-sm font-semibold tabular-nums ${tone.text}`}
        >
          {met}/{total}
        </text>
      </svg>
      <div className="min-w-0">
        <p className={`text-base font-semibold ${tone.text}`}>{headline}</p>
        <p className="text-ink-subtle mt-0.5 text-xs tabular-nums">{conditionsMet}</p>
      </div>
    </div>
  );
}
