import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { BackLink } from '@/components/BackLink';
import { Card, Section, SectionHeading, Stat } from '@/components/ui/Surface';
import { TabStrip } from '@/components/research/TabStrip';
import { StatementTable } from '@/components/research/StatementTable';
import { RatioGrid, CARD_ORDER } from '@/components/RatioGrid';
import { ValuationRangeChart } from '@/components/ValuationRangeChart';
import { GrowthTrajectory } from '@/components/GrowthTrajectory';
import {
  getListingExchange,
  getRatios,
  getSignal,
  getSnapshot,
  getThresholdOverrides,
  getTranslations as getDocTranslations,
  type SnapshotRow,
} from '@/lib/data/queries';
import { US_PRIMARY_VENUES } from '@/lib/pipeline/scanQuery';
import { isAnalystRatingHeadline } from '@/lib/data/newsFilter';
import {
  buildStatementTable,
  STATEMENT_ROWS,
  type StatementKind,
  type StatementPeriodicity,
} from '@/lib/data/statementTable';
import { peHistory, summariseValuation } from '@/lib/ratios/valuationHistory';
import { earningsQualityNotes } from '@/lib/ratios/earningsQuality';
import { buildTrajectory } from '@/lib/ratios/trajectory';
import { DEFAULT_THRESHOLDS } from '@/lib/ratios/thresholds';
import { fetchRecentFilings } from '@/lib/providers/secFilings';
import { secConfigured } from '@/lib/providers/secUserAgent';
import { fetchEarningsCalls, transcriptsConfigured } from '@/lib/providers/equibles';
import { createMarketDataService } from '@/lib/providers/marketData';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/docs';

export const dynamic = 'force-dynamic';

const SECTIONS = ['analysis', 'financials', 'news', 'filings', 'transcripts'] as const;
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

const metricAt = (
  statement:
    | { periods: Array<{ endDate: string; metrics: Record<string, number | null | undefined> }> }
    | null
    | undefined,
  index: number,
  key: string,
) => statement?.periods?.[index]?.metrics?.[key] ?? null;

/**
 * The analytical detail behind the verdict: the full ratio grid, the valuation
 * range, the growth trajectory, the earnings-quality notes and the analyst
 * estimates. All of it used to stack on the stock page; it lives here now, so
 * the default view can stay the decision path.
 *
 * Fetched only when the Analysis tab is open, like the other tabs — the stock
 * page has already done this work for its own render, and there is no reason to
 * repeat it on a tab nobody clicked. The computation is exactly what the stock
 * page used to run; only where it renders has changed.
 */
async function loadAnalysis(symbol: string, locale: Lang, snapshot: SnapshotRow) {
  const signal = await getSignal(symbol);
  if (!signal) return null;

  const [ratios, docs, thresholdOverrides, tRatio, tData, tValuation, tQuality] =
    await Promise.all([
      getRatios(symbol, signal.as_of),
      getDocTranslations(locale),
      getThresholdOverrides(),
      getTranslations('ratio'),
      getTranslations('data'),
      getTranslations('valuationHistory'),
      getTranslations('earningsQuality'),
    ]);

  const byKey = new Map(ratios.map((r) => [r.ratio_key, r]));

  const valuation = summariseValuation(
    peHistory(
      (snapshot.price_history ?? []).map((p) => ({ date: p.date, close: p.close })),
      (byKey.get('peg')?.history ?? []) as Array<{ period: string; value: number }>,
    ),
    byKey.get('pe')?.value ?? null,
  );


  const qualityYears = (snapshot.income_annual?.periods ?? []).map((period, i) => ({
    endDate: period.endDate,
    dilutedEps: metricAt(snapshot.income_annual, i, 'dilutedEps'),
    dilutedShares: metricAt(snapshot.income_annual, i, 'dilutedShares'),
    revenue: metricAt(snapshot.income_annual, i, 'revenue'),
    freeCashFlow: metricAt(snapshot.cash_annual, i, 'freeCashFlow'),
    operatingCashFlow: metricAt(snapshot.cash_annual, i, 'operatingCashFlow'),
    capitalExpenditure: metricAt(snapshot.cash_annual, i, 'capitalExpenditure'),
    stockBasedCompensation: metricAt(snapshot.cash_annual, i, 'stockBasedCompensation'),
  }));
  const qualityNotes = earningsQualityNotes(qualityYears);

  const pegRow = byKey.get('peg');
  const pegGrowth = (pegRow?.detail ?? {}) as {
    epsCagr?: number | null;
    endpointCagr?: number | null;
  };
  const trajectory = pegRow?.history?.length
    ? buildTrajectory(pegRow.history, {
        rate: pegGrowth.epsCagr ?? null,
        endpointCagr: pegGrowth.endpointCagr ?? null,
        bands: {
          highGrowth: DEFAULT_THRESHOLDS.lynch.value.highGrowth,
          averageGrowth: DEFAULT_THRESHOLDS.lynch.value.averageGrowth,
        },
      })
    : null;

  const lynch = docs.get(`lynch:${signal.lynch_category}`);

  return {
    signal,
    byKey,
    docs,
    thresholdOverrides,
    valuation,
    qualityNotes,
    trajectory,
    lynchName: lynch?.name ?? null,
    tRatio,
    tData,
    tValuation,
    tQuality,
  };
}

/**
 * Everything the default page deliberately leaves out.
 *
 * The ground rules keep the stock page to the verdict, the chart, the checklist
 * and the review, and this is where the rest lives — one click away, never
 * shown by default. Density is the point here and only here.
 *
 * Every tab is a URL. Section, statement and periodicity are all query
 * parameters, so a particular view is addressable and the whole thing works
 * with JavaScript off, like the rest of the app's navigation.
 *
 * The tabs degrade independently and quietly. Analysis and statements come from
 * the stored evaluation and are always there; news, filings and transcripts are
 * third-party and each renders an explanation rather than an error when its
 * source has nothing — which for a non-US listing is the normal case for two of
 * the three.
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
  const [t, snapshot, exchange] = await Promise.all([
    getTranslations('research'),
    getSnapshot(symbol),
    getListingExchange(symbol),
  ]);

  if (!snapshot) notFound();

  // SEC filings and Equibles transcripts are US-only; for a non-US listing those
  // two tabs are always empty, so they are hidden rather than shown blank (audit 29).
  const isUsListing = exchange != null && US_PRIMARY_VENUES.includes(exchange);
  const visibleSections = SECTIONS.filter(
    (key) => isUsListing || (key !== 'filings' && key !== 'transcripts'),
  );

  const requested = SECTIONS.includes(query.section as ResearchSection)
    ? (query.section as ResearchSection)
    : 'analysis';
  // A direct URL to a hidden tab falls back to the analysis tab.
  const section: ResearchSection = visibleSections.includes(requested) ? requested : 'analysis';
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
  // hundred a day on tabs nobody opened; the analysis tab is the same
  // discipline applied to the database.
  const analysis = section === 'analysis' ? await loadAnalysis(symbol, locale, snapshot) : null;
  // Rating and price-target headlines are hidden — a rating is a recommendation
  // this app does not surface (audit 18); the company's own news stays.
  const news =
    section === 'news'
      ? (await createMarketDataService({}).getNews(symbol, 25)).filter(
          (item) => !isAnalystRatingHeadline(item.title),
        )
      : [];
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
            tabs={visibleSections.map((key) => ({
              href: href({ section: key }),
              label: t(`tab.${key}`),
              active: key === section,
            }))}
          />
        </div>

        {section === 'analysis' && (
          <div className="mt-5 [&>section:first-child]:mt-0">
            {!analysis ? (
              <Card tone="sunken">
                <p className="text-sm text-ink-subtle">{t('noAnalysis')}</p>
              </Card>
            ) : (
              <>
                {analysis.valuation && (
                  <Section>
                    <SectionHeading>{analysis.tValuation('title')}</SectionHeading>
                    <p className="-mt-1 mb-2 max-w-prose text-sm text-ink-subtle">
                      {analysis.tValuation('intro')}
                    </p>
                    <Card>
                      <ValuationRangeChart
                        range={analysis.valuation}
                        labels={{
                          current: analysis.tValuation('current'),
                          median: analysis.tValuation('median'),
                          low: analysis.tValuation('low'),
                          high: analysis.tValuation('high'),
                          percentileCheap: analysis.tValuation.raw('percentileCheap') as string,
                          percentileRich: analysis.tValuation.raw('percentileRich') as string,
                          footnote: analysis.tValuation('footnote'),
                        }}
                      />
                    </Card>
                  </Section>
                )}

                {analysis.trajectory && (
                  <GrowthTrajectory
                    trajectory={analysis.trajectory}
                    bandName={analysis.lynchName}
                    formatPercent={(value) => formatPercent(value, locale)}
                    formatNumber={(value) => formatNumber(value, locale)}
                    labels={{
                      title: analysis.tRatio('trajectory.title'),
                      intro: analysis.tRatio('trajectory.intro'),
                      fitted: analysis.tRatio.raw('trajectory.fitted') as string,
                      endpoint: analysis.tRatio('trajectory.endpoint'),
                      dips: analysis.tRatio.raw('trajectory.dips') as string,
                      steady: analysis.tRatio('trajectory.steady'),
                      band: analysis.tRatio('trajectory.band'),
                      eps: analysis.tRatio('trajectory.eps'),
                      yoy: analysis.tRatio('trajectory.yoy'),
                      curve: analysis.tRatio('trajectory.curve'),
                      noFit: analysis.tRatio('trajectory.noFit'),
                    }}
                  />
                )}

                <Section>
                  <SectionHeading>{analysis.tRatio('allRatios')}</SectionHeading>
                  <RatioGrid
                    keys={CARD_ORDER}
                    byKey={analysis.byKey}
                    signal={analysis.signal}
                    docs={analysis.docs}
                    snapshot={snapshot}
                    thresholdOverrides={analysis.thresholdOverrides}
                    locale={locale}
                  />
                </Section>

                {analysis.qualityNotes.length > 0 && (
                  <Section>
                    <SectionHeading>{analysis.tQuality('heading')}</SectionHeading>
                    <p className="-mt-1 mb-2 text-sm text-ink-subtle">
                      {analysis.tQuality('intro')}
                    </p>
                    <Card tone="sunken">
                      <ul className="space-y-2.5">
                        {analysis.qualityNotes.map((note) => (
                          <li key={note.key} className="text-sm leading-relaxed text-ink-muted">
                            {/* `formatNumber` pads to two decimals, which turns
                                "over 3 years" into "over 3.00 years" and 8.5%
                                into 8.50%. These values are already rounded to
                                the precision each one deserves, so the
                                formatter's job here is only the separators. */}
                            {Object.entries(note.values).reduce(
                              (text, [key, value]) =>
                                text.replace(
                                  `{${key}}`,
                                  new Intl.NumberFormat(locale, {
                                    maximumFractionDigits: 2,
                                  }).format(value),
                                ),
                              analysis.tQuality.raw(note.key) as string,
                            )}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </Section>
                )}

                {snapshot.estimates && (
                  <Section>
                    <SectionHeading>
                      {locale === 'nl' ? 'Analistenverwachtingen' : 'Analyst estimates'}
                    </SectionHeading>
                    <Card className="text-sm">
                      {/* No analyst price target: a target is a recommendation, which
                          this app deliberately does not make (audit 18). The forward
                          EPS and growth stay — the PEG condition is built from them. */}
                      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Stat
                          label={locale === 'nl' ? 'Verwachte WPA' : 'Next-year EPS'}
                          // Per-share money, quoted in the trading currency,
                          // which for a company filing in another one is not the
                          // currency the statements are in.
                          value={formatCurrency(snapshot.estimates.nextYearEps, snapshot.currency, locale)}
                        />
                        <Stat
                          label={locale === 'nl' ? 'Verwachte groei' : 'Expected growth'}
                          value={formatPercent(snapshot.estimates.nextYearEpsGrowth, locale)}
                        />
                        <Stat
                          label={locale === 'nl' ? 'Analisten' : 'Analysts'}
                          value={snapshot.estimates.analystCount?.toString() ?? '—'}
                        />
                      </dl>
                      <p className="mt-3 text-xs text-ink-faint">
                        {analysis.tData('source')}: {snapshot.estimates_source}
                      </p>
                    </Card>
                  </Section>
                )}
              </>
            )}
          </div>
        )}

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
            ) : calls === null ? (
              // Null is the provider failing, empty is the provider saying
              // there is nothing. Collapsing the two is what let a wrong
              // endpoint read for a week as "this company has no calls".
              <Card tone="sunken">
                <p className="text-sm text-ink-subtle">{t('transcriptsUnavailable')}</p>
              </Card>
            ) : calls.length === 0 ? (
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
