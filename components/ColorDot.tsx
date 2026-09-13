const TONE: Record<string, string> = {
  green: 'bg-emerald-500',
  orange: 'bg-amber-500',
  red: 'bg-rose-500',
  gray: 'bg-slate-300 dark:bg-slate-600',
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
