import type { WhyPart } from '@/lib/signal/explain';

export interface WhyLabels {
  passes: string;
  missing: string;
  check: string;
  fullReasoning: string;
}

/**
 * The reasoning, led by its verdict.
 *
 * It was one paragraph of up to twelve lines — market cap, drawdown, the PEG
 * caveat, returns, cash flow, debt and a to-do, in a single run of prose.
 * Genuinely good writing, and on a phone nobody reaches the end of it, which
 * matters because the last sentence is usually the one asking you to do
 * something.
 *
 * So: the verdict on its own, then the sentences grouped under what they are
 * for, then the whole thing verbatim behind a disclosure for when you do want
 * to read it end to end. The full prose is the same text the email sends, and
 * comes from the same generator, so the two cannot drift.
 *
 * Falls back to the plain paragraph when a row predates the tagged sentences,
 * which every row written before today does.
 */
export function WhyBlock({
  parts,
  prose,
  labels,
}: {
  parts: WhyPart[] | null;
  prose: string;
  labels: WhyLabels;
}) {
  if (!parts || parts.length === 0) {
    return <p className="text-sm leading-relaxed text-ink-muted">{prose}</p>;
  }

  const verdict = parts.filter((p) => p.section === 'verdict');
  const groups: Array<{ key: 'passes' | 'missing' | 'check'; label: string; tone: string }> = [
    { key: 'passes', label: labels.passes, tone: 'text-emerald-700 dark:text-emerald-300' },
    { key: 'missing', label: labels.missing, tone: 'text-amber-700 dark:text-amber-300' },
    { key: 'check', label: labels.check, tone: 'text-ink-muted' },
  ];

  return (
    <div className="text-sm text-ink-muted">
      {verdict.length > 0 && (
        <p className="text-base font-medium leading-relaxed text-ink">
          {verdict.map((p) => p.text).join(' ')}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {groups.map((group) => {
          const lines = parts.filter((p) => p.section === group.key);
          if (lines.length === 0) return null;

          return (
            <div key={group.key}>
              <h3 className={`text-xs font-medium uppercase tracking-wide ${group.tone}`}>
                {group.label}
              </h3>
              <ul className="mt-1 space-y-1">
                {lines.map((line, i) => (
                  <li key={i} className="leading-relaxed">
                    {line.text}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* The full text is still one click away, and is the same prose the
          email sends — a reader who wants the argument in order can have it. */}
      <details className="mt-4">
        <summary className="text-ink-subtle cursor-pointer text-xs underline-offset-4 hover:underline">
          {labels.fullReasoning}
        </summary>
        <p className="mt-2 leading-relaxed">{prose}</p>
      </details>
    </div>
  );
}
