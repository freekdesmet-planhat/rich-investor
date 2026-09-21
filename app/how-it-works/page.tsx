import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { Card } from '@/components/ui/Surface';
import { finishOnboarding } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('navLabel') };
}

/**
 * The primer, shown once on a first sign-in and reachable from the nav after.
 *
 * Four steps, and the step lives in the URL rather than in component state.
 * That is worth a sentence, because the obvious build is a client component
 * with a `useState` counter:
 *
 *   * it works with JavaScript off, like the rest of the app's navigation;
 *   * a step is linkable, so "read the bit about price and growth" is a URL;
 *   * Back and Next are real links, so the browser's own back button does
 *     what the reader expects instead of leaving the page entirely.
 *
 * Deliberately not a modal over the watchlist. A dialog on first sign-in
 * would be covering the one screen a new member is trying to make sense of,
 * and it would be the only part of the app that cannot be linked to or
 * returned to later.
 *
 * It is also not a second methodology page. That one is reference material —
 * every condition, its exact threshold, the credit. This is four screens of
 * plain language for someone who has not read anything yet, and it links
 * there at the end rather than repeating it.
 */
const STEPS = ['what', 'verdicts', 'priceAndGrowth', 'yours'] as const;

/**
 * `**bold**` and `*italic*`, which is all the copy uses.
 *
 * A markdown dependency for this would be a poor trade, and the alternative —
 * putting `<strong>` in the translation files — puts markup where translators
 * and copy edits live.
 *
 * Both markers, not just the first: an earlier version split on `**` alone and
 * shipped a literal `*might*` onto the page, because the copy reaches for
 * italics exactly once and the renderer did not know about it. One regex over
 * both, so adding emphasis to a sentence cannot silently print asterisks.
 */
function renderParagraph(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export default async function HowItWorksPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const t = await getTranslations('onboarding');
  const { step: raw } = await searchParams;

  const requested = Number(raw);
  const index = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), STEPS.length) - 1 : 0;
  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-2xl px-4 py-8">
        {/* Progress before the content, so the reader knows how long this is
            before deciding whether to start. Four short screens is a very
            different proposition from an unknown number of them. */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            {t('stepOf', { current: index + 1, total: STEPS.length })}
          </p>
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((key, i) => (
              <span
                key={key}
                className={`h-1.5 w-8 rounded-full ${i <= index ? 'bg-accent' : 'bg-line'}`}
              />
            ))}
          </div>
        </div>

        <Card className="mt-4" padding="loose">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {t(`steps.${step}.title`)}
          </h1>

          <div className="mt-4 space-y-4">
            {t(`steps.${step}.body`)
              .split('\n\n')
              .map((paragraph, i) => (
                <p key={i} className="text-[15px] leading-relaxed text-ink-muted">
                  {renderParagraph(paragraph)}
                </p>
              ))}
          </div>

          {isLast && (
            <Link
              href="/methodology"
              className="mt-5 inline-block text-sm font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              {t('methodLink')} →
            </Link>
          )}
        </Card>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {index > 0 && (
            <Link
              href={`/how-it-works?step=${index}`}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-sm text-ink-muted transition hover:bg-surface-hover"
            >
              {t('back')}
            </Link>
          )}

          {isLast ? (
            <form action={finishOnboarding}>
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
              >
                {t('done')}
              </button>
            </form>
          ) : (
            <Link
              href={`/how-it-works?step=${index + 2}`}
              className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
            >
              {t('next')}
            </Link>
          )}

          {/* Skip stays available on every step, and marks the primer seen
              exactly as finishing does. Someone who wants out on step one has
              given their answer. */}
          {!isLast && (
            <form action={finishOnboarding} className="ml-auto">
              <button
                type="submit"
                className="rounded-lg px-2.5 py-1.5 text-sm text-ink-subtle transition hover:bg-surface-hover hover:text-ink"
              >
                {t('skip')}
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
