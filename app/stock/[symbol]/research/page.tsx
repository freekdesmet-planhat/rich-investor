import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { BackLink } from '@/components/BackLink';
import { Card, Section, SectionHeading } from '@/components/ui/Surface';
import { TabStrip } from '@/components/research/TabStrip';
import { StatementTable } from '@/components/research/StatementTable';
import { getSnapshot } from '@/lib/data/queries';
import {
  buildStatementTable,
  STATEMENT_ROWS,
  type StatementKind,
  type StatementPeriodicity,
} from '@/lib/data/statementTable';
import { fetchRecentFilings } from '@/lib/providers/secFilings';
import { secConfigured } from '@/lib/providers/secUserAgent';
import { fetchEarningsCalls, transcriptsConfigured } from '@/lib/providers/equibles';
import { createMarketDataService } from '@/lib/providers/marketData';
import { formatDate, formatNumber, formatPercent } from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/docs';

export const dynamic = 'force-dynamic';

const SECTIONS = ['financials', 'news', 'filings', 'transcripts'] as const;
type ResearchSection = (typeof SECTIONS)[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const t = await getTranslations('research');
  return { title: `${decodeURIComponent(symbol).toUpperCase()} — ${t('title')}` };
}

/**
 * Everything the default page deliberately leaves out.
 *
 * The ground rules keep the stock page to the verdict, the chart, the thesis
 * and the review, and this is where the rest lives — one click away, never
 * shown by default. Density is the point here and only here.
 *
 * Every tab is a URL. Section, statement and periodicity are all query
 * parameters, so a particular view is addressable and the whole thing works
 * with JavaScript off, like the rest of the app's navigation.
 *
 * The four sections degrade independently and quietly. Statements come from
 * the stored snapshot and are always there; news, filings and transcripts
 * are third-party and each renders an explanation rather than an error when
 * its source has nothing — which for a non-US listing is the normal case for
 * two of the three.
 */
export default async function ResearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ section?: string; statement?: string; period?: string }>;
}) {
  const [{ symbol: raw }, query] = await Promise.all([params, searchParams]);
  const symbol = decodeURIComponent(raw).toUpperCase();

  const locale = (await getLocale()) as Lang;
  const [t, snapshot] = await Promise.all([getTranslations('research'), getSnapshot(symbol)]);

  if (!snapshot) notFound();

  const section: ResearchSection = SECTIONS.includes(query.section as ResearchSection)
    ? (query.section as ResearchSection)
    : 'financials';
  const statement: StatementKind = (['income', 'balance', 'cash'] as const).includes(
    query.statement as StatementKind,
  )
    ? (query.statement as StatementKind)
    : 'income';
  const period: StatementPeriodicity = query.period === 'quarterly' ? 'quarterly' : 'annual';

  const href = (next: Partial<{ section: string; statement: string; period: string }>) => {
    const search = new URLSearchParams({ section, statement, period, ...next });
    return `/stock/${encodeURIComponent(symbol)}/research?${search.toString()}`;
  };

  // Only the section being looked at is fetched. Loading news, filings and
  // transcripts on every view would spend a third-party allowance of a
  // hundred a day on tabs nobody opened.
  const news = section === 'news' ? await createMarketDataService({}).getNews(symbol, 25) : [];
  const filings = section === 'filings' ? await fetchRecentFilings(symbol) : [];
  const calls = section === 'transcripts' && transcriptsConfigured()
    ? await fetchEarningsCalls(symbol)
    : null;

  const periods =
    (snapshot as unknown as Record<string, { periods?: Array<{ endDate: string; metrics: Record<string, number | null | undefined> }> } | null>)[
      `${statement}_${period}`
    ]?.periods ?? [];
  const table = buildStatementTable(periods, STATEMENT_ROWS[statement]);

  const currency = snapshot.filing_currency ?? snapshot.currency ?? null;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <BackLink href={`/stock/${encodeURIComponent(symbol)}`} label={t('back')} />

        <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{symbol}</h1>
          <p className="text-sm text-ink-subtle">{t('title')}</p>
        </div>

        <div className="mt-4 border-b border-line pb-3">
          <TabStrip
            label={t('title')}
            tabs={SECTIONS.map((key) => ({
              href: href({ section: key }),
              label: t(`tab.${key}`),
              active: key === section,
            }))}
          />
        </div>

        {section === 'financials' && (
          <Section className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <TabStrip
                label={t('tab.financials')}
                size="small"
                tabs={(['income', 'balance', 'cash'] as const).map((key) => ({
                  href: href({ statement: key }),
                  label: t(`statement.${key}`),
                  active: key === statement,
                }))}
              />
              <TabStrip
                label={t('tab.financials')}
                size="small"
                tabs={(['annual', 'quarterly'] as const).map((key) => ({
                  href: href({ period: key }),
                  label: t(`period.${key}`),
                  active: key === period,
                }))}
              />
            </div>

            <Card padding="tight">
              {table.rows.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-subtle">{t('noStatements')}</p>
              ) : (
                <StatementTable
                  table={table}
                  labels={{ growthRow: t('growthRow') }}
                  formatColumn={(endDate) =>
                    period === 'annual' ? endDate.slice(0, 4) : formatDate(endDate, locale)
                  }
                  formatValue={(value, format) =>
                    format === 'perShare'
                      ? formatNumber(value, locale)
                      : format === 'number'
                        ? new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
                        : new Intl.NumberFormat(locale, {
                            notation: 'compact',
                            maximumFractionDigits: 1,
                          }).format(value)
                  }
                  formatPercent={(value) => formatPercent(value, locale)}
                />
              )}
            </Card>
            {currency && (
              <p className="mt-2 text-xs text-ink-faint">
                {t('figuresIn', { currency })}
              </p>
            )}
          </Section>
        )}

        {section === 'news' && (
          <Section className="mt-5">
            <SectionHeading>{t('tab.news')}</SectionHeading>
            {news.length === 0 ? (
              <Card><p className="text-sm text-ink-subtle">{t('noNews')}</p></Card>
            ) : (
              <Card padding="none">
                <ul className="divide-y divide-line">
                  {news.map((item, i) => (
                    <li key={`${item.url ?? i}`} className="px-4 py-3">
                      <a
                        href={item.url ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                      >
                        {item.title}
                      </a>
                      <p className="mt-0.5 text-xs text-ink-subtle">
                        {[item.source, item.publishedAt ? formatDate(item.publishedAt, locale) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Section>
        )}

        {section === 'filings' && (
          <Section className="mt-5">
            <SectionHeading>{t('tab.filings')}</SectionHeading>
            {filings.length === 0 ? (
              <Card tone={secConfigured() ? undefined : 'sunken'}>
                <p className="text-sm text-ink-subtle">
                  {/* Three different silences, and saying the wrong one is worse
                      than saying nothing: a US filer told it is not a US filer
                      reads as the app being broken, which it would be. */}
                  {!secConfigured()
                    ? t('filingsUnconfigured')
                    : symbol.includes('.')
                      ? t('filingsNotUsFiler')
                      : t('noFilings')}
                </p>
              </Card>
            ) : (
              <Card padding="none">
                <ul className="divide-y divide-line">
                  {filings.map((filing) => (
                    <li key={filing.url} className="flex flex-wrap items-baseline gap-x-4 px-4 py-2.5 text-sm">
                      <a
                        href={filing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-24 shrink-0 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                      >
                        {filing.form}
                      </a>
                      <span className="tabular-nums text-ink-muted">
                        {t('filingFiled')} {formatDate(filing.filedOn, locale)}
                      </span>
                      {filing.reportFor && (
                        <span className="tabular-nums text-ink-faint">
                          {t('filingPeriod')} {formatDate(filing.reportFor, locale)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Section>
        )}

        {section === 'transcripts' && (
          <Section className="mt-5">
            <SectionHeading>{t('tab.transcripts')}</SectionHeading>
            {!transcriptsConfigured() ? (
              <Card tone="sunken">
                <p className="text-sm text-ink-subtle">{t('transcriptsUnconfigured')}</p>
              </Card>
            ) : !calls || calls.length === 0 ? (
              <Card><p className="text-sm text-ink-subtle">{t('noTranscripts')}</p></Card>
            ) : (
              <Card padding="none">
                <ul className="divide-y divide-line">
                  {calls.map((call) => (
                    <li key={call.id} className="flex flex-wrap items-baseline gap-x-4 px-4 py-2.5 text-sm">
                      <span className="w-28 shrink-0 font-medium text-ink">
                        FY{call.fiscalYear} Q{call.fiscalQuarter}
                      </span>
                      <span className="text-ink-muted">
                        {call.callDate ? formatDate(call.callDate, locale) : call.title}
                      </span>
                      {call.hasTranscript && (
                        <Link
                          href={`/stock/${encodeURIComponent(symbol)}/research/call/${call.fiscalYear}/${call.fiscalQuarter}`}
                          className="ml-auto font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
                        >
                          {t('openCall')}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Section>
        )}
      </main>
    </>
  );
}
