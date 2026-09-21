import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { BackLink } from '@/components/BackLink';
import { Card, Section } from '@/components/ui/Surface';
import { fetchTranscript, transcriptsConfigured } from '@/lib/providers/equibles';
import { formatDate } from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/docs';

export const dynamic = 'force-dynamic';

/**
 * One earnings call, as speaker turns.
 *
 * Its own route rather than an expander on the list, because a call is
 * several hundred turns of prose — it wants a page, and it wants to be
 * linkable. Somebody quoting the CFO to themselves three weeks later should
 * be able to get back to the exact call.
 *
 * Fails the same quiet way as everything else on the transcript path: no
 * key, no coverage, or a provider having a bad afternoon all render a short
 * explanation rather than an error page.
 */
export default async function CallPage({
  params,
}: {
  params: Promise<{ symbol: string; year: string; quarter: string }>;
}) {
  const { symbol: raw, year, quarter } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();

  const fiscalYear = Number(year);
  const fiscalQuarter = Number(quarter);
  if (!Number.isInteger(fiscalYear) || !Number.isInteger(fiscalQuarter)) notFound();

  const locale = (await getLocale()) as Lang;
  const t = await getTranslations('research');

  const transcript = transcriptsConfigured()
    ? await fetchTranscript(symbol, fiscalYear, fiscalQuarter)
    : null;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-6">
        <BackLink
          href={`/stock/${encodeURIComponent(symbol)}/research?section=transcripts`}
          label={t('tab.transcripts')}
        />

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
          {symbol} · FY{fiscalYear} Q{fiscalQuarter}
        </h1>
        {transcript?.callDate && (
          <p className="mt-0.5 text-sm text-ink-subtle">{formatDate(transcript.callDate, locale)}</p>
        )}

        <Section>
          {!transcript || transcript.turns.length === 0 ? (
            <Card tone="sunken">
              <p className="text-sm text-ink-subtle">
                {transcriptsConfigured() ? t('noTranscripts') : t('transcriptsUnconfigured')}
              </p>
            </Card>
          ) : (
            <>
              <Card padding="loose">
                <div className="space-y-5">
                  {transcript.turns.map((turn, i) => (
                    <div key={i}>
                      {turn.speakerName && (
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                          {turn.speakerName}
                          {turn.speakerRole && (
                            <span className="ml-2 font-normal normal-case tracking-normal text-ink-faint">
                              {turn.speakerRole}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{turn.text}</p>
                    </div>
                  ))}
                </div>
              </Card>
              {transcript.hasMore && (
                <p className="mt-2 text-xs text-ink-faint">{t('transcriptPartial')}</p>
              )}
            </>
          )}
        </Section>
      </main>
    </>
  );
}
