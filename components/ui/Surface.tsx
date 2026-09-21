/**
 * The handful of shapes every page is actually built from.
 *
 * These exist because the same four or five constructions were being written
 * out by hand on every page — a card, a section with a heading, a label above
 * a figure — each time as a string of a dozen Tailwind classes, each time
 * very slightly differently. The variation was never intentional: section
 * headings were `text-sm font-medium` in six places and `text-xs uppercase`
 * in two, and card padding was `p-3` or `p-4` depending on which page you
 * happened to be on.
 *
 * Naming the shapes is what makes a design language enforceable. A page that
 * says `<Card>` cannot drift from one that says `<Card>`; two pages that each
 * spell out their own border and background inevitably will.
 *
 * Deliberately small. This is not a component library — it is the five things
 * the stock page needed, and the rest of the app will add to it as the rollout
 * reaches each page rather than inventing them up front.
 */
import type { ReactNode } from 'react';

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(' ');

/**
 * Anything lifted off the page: a panel, a metric, a block of prose.
 *
 * `sunken` is for a well rather than a card — an inset area on an existing
 * surface, like the reasoning block under the verdict, which should read as
 * part of the page rather than as another thing stacked on it.
 */
export function Card({
  children,
  className,
  padding = 'normal',
  tone = 'raised',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'tight' | 'normal' | 'loose';
  tone?: 'raised' | 'sunken' | 'flat';
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  const padded = { none: '', tight: 'p-3', normal: 'p-4', loose: 'p-5 sm:p-6' }[padding];
  const toned = {
    raised: 'bg-surface border-line shadow-card',
    sunken: 'bg-surface-sunken border-line',
    flat: 'bg-transparent border-line',
  }[tone];

  return <Tag className={cx('rounded-xl border', toned, padded, className)}>{children}</Tag>;
}

/**
 * A section heading.
 *
 * Small, uppercase and tracked, rather than simply a smaller bold sentence.
 * The page has a dozen of these and only one real title; making them a
 * different *kind* of thing instead of a smaller version of the same thing is
 * what stops the page reading as a stack of equally important blocks.
 */
export function SectionHeading({
  children,
  action,
  className,
}: {
  children: ReactNode;
  /** Right-aligned control on the same line — a toggle, a link, a range picker. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
        {children}
      </h2>
      {action}
    </div>
  );
}

/**
 * Vertical rhythm between the page's major blocks.
 *
 * One number, in one place. The stock page had climbed to five different
 * top margins between sections — `mt-3`, `mt-5`, `mt-6`, `mt-8`, and one
 * `mt-2` — none of which meant anything, all of which were a guess made while
 * writing the section below them.
 */
export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx('mt-8', className)}>
      {children}
    </section>
  );
}

/**
 * A label above a figure.
 *
 * The label is small and quiet, the figure is large and tabular. This pairing
 * appears about fifteen times on the stock page and was written fifteen ways.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'pass' | 'near' | 'fail' | 'muted';
  className?: string;
}) {
  const toned = {
    default: 'text-ink',
    pass: 'text-pass',
    near: 'text-near',
    fail: 'text-fail',
    muted: 'text-ink-subtle',
  }[tone];

  return (
    <div className={className}>
      <dt className="text-xs font-medium text-ink-subtle">{label}</dt>
      <dd className={cx('mt-1 text-lg font-semibold tabular-nums', toned)}>{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

/**
 * A small piece of metadata that sits inline with others.
 *
 * Quiet by default: these annotate, they do not announce. `tone` exists for
 * the few that carry a verdict, and nothing else should use it.
 */
export function Chip({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'pass' | 'near' | 'fail' | 'accent';
  title?: string;
}) {
  const toned = {
    neutral: 'bg-surface-sunken text-ink-muted border-line',
    pass: 'bg-pass-wash text-pass border-pass-line',
    near: 'bg-near-wash text-near border-near-line',
    fail: 'bg-fail-wash text-fail border-fail-line',
    accent: 'bg-accent-wash text-accent border-accent/20',
  }[tone];

  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        toned,
      )}
    >
      {children}
    </span>
  );
}
