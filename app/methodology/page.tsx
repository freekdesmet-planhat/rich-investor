import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import type { Lang } from '@/lib/i18n/docs';
import { Card, Section, SectionHeading } from '@/components/ui/Surface';
import { getTranslations as getDocTranslations } from '@/lib/data/queries';
import { CONDITION_LABEL } from '@/lib/signal/explain';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('methodology');
  return { title: t('title'), description: t('intro') };
}

/**
 * The one place the method explains itself, and the one place the book is
 * credited.
 *
 * Until now the attribution was scattered: "(from the book)" appeared on
 * twenty-two thresholds, in a dozen ratio explanations, on the market-context
 * subtitle and in the account settings. Repeated that often it stopped
 * reading as a credit and started reading as a disclaimer — as though the app
 * were quoting someone else's homework rather than applying a method. The
 * ground rules ask for one clear credit somewhere sensible; this is it.
 *
 * The nine conditions are read from `CONDITION_LABEL` and described from the
 * same `translations` rows the checklist itself uses, so this page cannot
 * drift out of step with what the app actually checks. A methodology page
 * that described a tenth condition, or missed one, would be worse than none.
 */
export default async function MethodologyPage() {
  const locale = (await getLocale()) as Lang;
  const [t, docs] = await Promise.all([
    getTranslations('methodology'),
    getDocTranslations(locale),
  ]);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{t('title')}</h1>
        <p className="mt-2 text-base leading-relaxed text-ink-muted">{t('intro')}</p>

        <Section>
          <SectionHeading>{t('conditionsTitle')}</SectionHeading>
          <p className="mb-4 text-sm leading-relaxed text-ink-muted">{t('conditionsIntro')}</p>

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

        {/* Anchored so the "Why only four sectors?" links elsewhere land here
            (launch item 6). The sector rule fails a company on identity, not on
            its numbers, so the reasoning — and its limits — are stated plainly. */}
        <Section>
          <div id="four-sectors" className="scroll-mt-6">
            <SectionHeading>{t('fourSectors.heading')}</SectionHeading>
            <Card tone="sunken">
              <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
                {(t.raw('fourSectors.body') as string)
                  .split('\n\n')
                  .map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
              </div>
              <p className="mt-3 text-xs text-ink-faint">{t('fourSectors.source')}</p>
            </Card>
          </div>
        </Section>

        <Section>
          <SectionHeading>{t('fixedTitle')}</SectionHeading>
          <p className="text-sm leading-relaxed text-ink-muted">{t('fixedBody')}</p>
        </Section>

        <Section>
          <SectionHeading>{t('revisitTitle')}</SectionHeading>
          <p className="text-sm leading-relaxed text-ink-muted">{t('revisitBody')}</p>
        </Section>

        <Section>
          <SectionHeading>{t('honestTitle')}</SectionHeading>
          <p className="text-sm leading-relaxed text-ink-muted">{t('honestBody')}</p>
        </Section>

        <Section>
          <SectionHeading>{t('creditTitle')}</SectionHeading>
          <Card tone="sunken">
            <p className="text-sm leading-relaxed text-ink-muted">{t('creditBody')}</p>
          </Card>
        </Section>
      </main>
    </>
  );
}
