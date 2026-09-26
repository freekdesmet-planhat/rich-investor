import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { Card, Section, SectionHeading } from '@/components/ui/Surface';
import { getTranslations as getDocTranslations } from '@/lib/data/queries';
import { CONDITION_LABEL } from '@/lib/signal/explain';
import type { Lang } from '@/lib/i18n/config';
import { finishOnboarding } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('navLabel') };
}

/**
 * How it works — one page, merged from the old primer and methodology (round 2,
 * item 4).
 *
 * With `?step=` it is the first-login primer: four short screens, the step in the
 * URL so it works with no JavaScript, is linkable, and Back/Next are real links.
 * Without a step it is the full reference: the same four-step idea as plain
 * content, then the nine conditions in detail, why only four sectors, why the
 * rules don't change, and the single credit to the book. /methodology redirects
 * here, so there is one page and one nav item.
 */
const STEPS = ['what', 'verdicts', 'priceAndGrowth', 'yours'] as const;

/**
 * `**bold**` and `*italic*`, which is all the copy uses. A markdown dependency
 * would be a poor trade, and putting `<strong>` in the translation files puts
 * markup where translators and copy edits live. Both markers, so emphasis can
 * never silently print an asterisk.
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
  const { step: raw } = await searchParams;
  const t = await getTranslations('onboarding');

  // --- primer mode: the stepped first-login walkthrough ---------------------
  if (raw != null) {
    const requested = Number(raw);
    const index = Number.isInteger(requested)
      ? Math.min(Math.max(requested, 1), STEPS.length) - 1
      : 0;
    const step = STEPS[index];
    const isLast = index === STEPS.length - 1;

    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-8">
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
                href="/how-it-works"
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

  // --- reference mode: the full page, from the nav --------------------------
  const locale = (await getLocale()) as Lang;
  const [tm, docs] = await Promise.all([getTranslations('methodology'), getDocTranslations(locale)]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{t('navLabel')}</h1>

        {/* The four-step idea, as content rather than a walkthrough. */}
        <div className="mt-6 space-y-6">
          {STEPS.map((step) => (
            <section key={step}>
              <SectionHeading>{t(`steps.${step}.title`)}</SectionHeading>
              <div className="mt-2 space-y-3">
                {t(`steps.${step}.body`)
                  .split('\n\n')
                  .map((paragraph, i) => (
                    <p key={i} className="text-[15px] leading-relaxed text-ink-muted">
                      {renderParagraph(paragraph)}
                    </p>
                  ))}
              </div>
            </section>
          ))}
        </div>

        {/* The nine conditions in detail. */}
        <Section>
          <SectionHeading>{tm('conditionsTitle')}</SectionHeading>
          <p className="mb-4 text-sm leading-relaxed text-ink-muted">{tm('conditionsIntro')}</p>
          <Card padding="none">
            <ol className="divide-y divide-line">
              {Object.keys(CONDITION_LABEL).map((key, index) => {
                const doc = docs.get(`condition:${key}`);
                return (
                  <li key={key} className="flex gap-3 px-4 py-3">
                    <span className="w-5 shrink-0 text-sm tabular-nums text-ink-faint">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {doc?.name ?? CONDITION_LABEL[key][locale]}
                      </p>
                      {doc?.target && (
                        <p className="mt-0.5 text-sm text-ink-subtle">{doc.target}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </Section>

        {/* Why only four sectors? */}
        <Section>
          <div id="four-sectors" className="scroll-mt-6">
            <SectionHeading>{tm('fourSectors.heading')}</SectionHeading>
            <Card tone="sunken">
              <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
                {(tm.raw('fourSectors.body') as string)
                  .split('\n\n')
                  .map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
              </div>
              <p className="mt-3 text-xs text-ink-faint">{tm('fourSectors.source')}</p>
            </Card>
          </div>
        </Section>

        {/* Why the rules don't change. */}
        <Section>
          <SectionHeading>{tm('fixedTitle')}</SectionHeading>
          <p className="text-sm leading-relaxed text-ink-muted">{tm('fixedBody')}</p>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">{tm('revisitBody')}</p>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">{tm('honestBody')}</p>
        </Section>

        {/* The single credit to the book. */}
        <Section>
          <SectionHeading>{tm('creditTitle')}</SectionHeading>
          <Card tone="sunken">
            <p className="text-sm leading-relaxed text-ink-muted">{tm('creditBody')}</p>
          </Card>
        </Section>
      </main>
    </>
  );
}
