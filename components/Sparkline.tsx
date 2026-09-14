/**
 * Mini-chart of a ratio's last five fiscal years (section 5).
 *
 * The book stresses that a single year says little and the trend says
 * everything, so every ratio card carries one where history exists.
 */
export function Sparkline({
  points,
  className = 'h-6 w-24',
}: {
  points: Array<{ period: string; value: number }>;
  /**
   * Size included, because Tailwind decides which of two conflicting utilities
   * wins by its own ordering, not by where they sit in the attribute — a caller
   * appending `h-5` to a hardcoded `h-6` gets whichever Tailwind emitted last.
   */
  className?: string;
}) {
  if (points.length < 2) return null;

  const width = 96;
  const height = 24;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.value - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const rising = values[values.length - 1] >= values[0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${className}`}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={rising ? 'stroke-emerald-500' : 'stroke-rose-500'}
      />
    </svg>
  );
}
