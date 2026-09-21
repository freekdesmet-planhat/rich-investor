/**
 * The same three verdict colours as the status badge and the checklist, so a
 * green dot on a ratio card is the same green as the verdict it feeds.
 */
const TONE: Record<string, string> = {
  green: 'bg-pass',
  orange: 'bg-near',
  red: 'bg-fail',
  gray: 'bg-none',
};

/** The colour code on every ratio card (section 5). */
export function ColorDot({ color, label }: { color: string; label: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${TONE[color] ?? TONE.gray}`}
      role="img"
      aria-label={label}
    />
  );
}
