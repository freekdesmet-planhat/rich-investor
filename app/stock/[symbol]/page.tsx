import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PriceChart } from '@/components/PriceChart';
import { BackLink } from '@/components/BackLink';
import { RatioCard } from '@/components/RatioCard';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { AiThesisCard } from '@/components/AiThesisCard';
import { RemoveFromWatchlist } from '@/components/RemoveFromWatchlist';
import { DataFreshness } from '@/components/DataFreshness';
import { QualitativeReview, type ReviewRecord } from '@/components/review/QualitativeReview';
import { ConditionTrend } from '@/components/ConditionTrend';
import { GrowthTrajectory } from '@/components/GrowthTrajectory';
import { PegBasisBadge } from '@/components/PegBasisBadge';
import { Card, Chip, Section, SectionHeading, Stat } from '@/components/ui/Surface';
import { createClient } from '@/lib/supabase/server';
import {
  getPosition,
  getRatios,
  getReviews,
  getSectorPeerRatios,
  getSignal,
  getSignalHistory,
  getSnapshot,
  getThresholdOverrides,
  getTickerSummary,
  getTranslations as getDocTranslations,
  getWatchlistSymbols,
  type RatioRow,
} from '@/lib/data/queries';
import type { Lang } from '@/lib/i18n/config';
import { stripSourceSuffix, unwrapParagraphs } from '@/lib/i18n/docs';
import { buildTrend, conditionChanges } from '@/lib/data/trend';
import { dataQualityOf, sourcesForRatio } from '@/lib/data/dataQuality';
import { DataQualityNotice } from '@/components/DataQualityNotice';
import { WhyBlock } from '@/components/WhyBlock';
import { PositionBlock } from '@/components/PositionBlock';
import { positionReturn } from '@/lib/data/position';
import {
  isOverridden,
  overriddenTargetLabel,
  RATIO_THRESHOLD,
} from '@/lib/ratios/editableThresholds';
import { buildTrajectory } from '@/lib/ratios/trajectory';
import { CHART_RANGES, isChartRange, pointsInRange, type ChartRange } from '@/lib/data/priceRange';
import { CONDITION_LABEL } from '@/lib/signal/explain';
import { upcomingEarnings } from '@/lib/data/earnings';
import { LiquidityNote } from '@/components/LiquidityNote';
import { ValuationRangeChart } from '@/components/ValuationRangeChart';
import { peHistory, summariseValuation } from '@/lib/ratios/valuationHistory';
import { declineContext } from '@/lib/data/declineHistory';
import { earningsQualityNotes } from '@/lib/ratios/earningsQuality';
import { comparePeers, PEER_METRICS } from '@/lib/data/peerComparison';
import { PeerComparison } from '@/components/PeerComparison';
import { formatBillions, formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/i18n/format';
import { DEFAULT_THRESHOLDS } from '@/lib/ratios/thresholds';
import { thesisEnabled } from '@/lib/ai/thesis';

export const dynamic = 'force-dynamic';

/** A quarter of stored evaluations: long enough to show a recovery forming. */
const TREND_DAYS = 90;

/** Card order: valuation, then returns, then growth, then the core signal. */
const CARD_ORDER = [
  'pe',
  'peg',
  'ev_ebit',
  'p_fcf',
  'earnings_quality',
  'roe',
  'roa',
  'eps_growth',
  'revenue_growth',
  'gross_margin',
  'net_margin',
  'debt',
  'rnd_adjusted_pe',
  'payout_ratio',
  'dividend_yield',
  'inventory_receivables',
  'p_s',
  'p_b',
  'drawdown_5y',
  'market_cap',
];

function formatRatio(row: RatioRow, lang: Lang): string {
  if (row.value == null) return '—';
  switch (row.unit) {
    case 'percent':
      return formatPercent(row.value, lang);
    case 'currency':
      return formatBillions(row.value, row.currency ?? 'USD', lang);
    default:
      return formatNumber(row.value, lang);
  }
}

/**
 * The checklist's pass mark, for the cards whose healthy target is stricter.
 *
 * Condition 8 passes at 70% of net income and condition 9 at net debt/EBITDA
 * 2.5, while those two cards state the healthy targets (1 and 1). Printing only
 * one of the pair made the page contradict itself, so both are shown and both
 * are read from the same constant — a change to `DEFAULT_THRESHOLDS` moves the
 * checklist and the card together.
 */
function checklistGate(ratioKey: string, lang: Lang): string | null {
  switch (ratioKey) {
    case 'debt':
      return `≤ ${formatNumber(DEFAULT_THRESHOLDS.debt.value.netDebtEbitdaOrange, lang, 1)}`;
    case 'earnings_quality':
      return `≥ ${formatPercent(DEFAULT_THRESHOLDS.earningsQuality.value.orange, lang, 0)}`;
    default:
      return null;
  }
}

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { symbol: raw } = await params;
  const { range: rawRange } = await searchParams;
  // In the URL, like every other view choice in the app, so it survives a
  // reload and can be shared.
  const range: ChartRange = isChartRange(rawRange) ? rawRange : '5y';
  const symbol = decodeURIComponent(raw).toUpperCase();
  const locale = (await getLocale()) as Lang;

  const signal = await getSignal(symbol);
  if (!signal) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [ratios, snapshot, docs, reviewData, position, history, thresholdOverrides, summary, tRatio, tSignal, tData, tSector, tStatus, tThesis, tChart, tNav, tPosition, tEarnings, tLiquidity, tValuation, tDecline, tQuality, tPeers, tResearch, peerRows] =
    await Promise.all([
    getRatios(symbol, signal.as_of),
    getSnapshot(symbol),
    getDocTranslations(locale),
    getReviews(symbol),
    getPosition(symbol),
    getSignalHistory(symbol, TREND_DAYS),
    getThresholdOverrides(),
    // Cached per language: a missing Dutch summary is a missing row, not a
    // reason to show the English one.
    getTickerSummary(symbol, locale),
    getTranslations('ratio'),
    getTranslations('signal'),
    getTranslations('data'),
    getTranslations('sector'),
    getTranslations('status'),
    getTranslations('thesis'),
    getTranslations('chart'),
    getTranslations('nav'),
    getTranslations('position'),
    getTranslations('earnings'),
    getTranslations('liquidity'),
    getTranslations('valuationHistory'),
    getTranslations('declineHistory'),
    getTranslations('earningsQuality'),
    getTranslations('peers'),
    getTranslations('research'),
    getSectorPeerRatios(signal.focus_sector, signal.as_of, symbol, PEER_METRICS),
  ]);

  const tWatchlist = await getTranslations('watchlist');
  const onWatchlist = (await getWatchlistSymbols()).has(symbol);

  const byKey = new Map(ratios.map((r) => [r.ratio_key, r]));
  const drawdown = byKey.get('drawdown_5y');
  const drawdownDetail = (drawdown?.detail ?? {}) as {
    high?: number | null;
    highDate?: string | null;
  };

  // Notes belong to whoever wrote them, so each review carries only its own.
  const toRecord = (review: (typeof reviewData.reviews)[number]): ReviewRecord => ({
    ...review,
    notes: reviewData.notes
      .filter((n) => n.review_id === review.id)
      .map((n) => ({ note: n.note, noted_on: n.noted_on })),
    authorLabel: review.user_id === user?.id ? (user?.email ?? '') : review.user_id.slice(0, 8),
    isMine: review.user_id === user?.id,
  });

  // The stored evaluations, read back as movement. The checklists come with
  // them so the page can name the conditions that flipped, not only count them.
  const trend = buildTrend(
    symbol,
    history.map((row) => ({
      as_of: row.as_of,
      conditions_met: row.conditions_met,
      conditions_applicable: row.conditions_applicable,
      status: row.status,
    })),
  );
  const reference = trend?.reference
    ? history.find((row) => row.as_of === trend.reference!.as_of)
    : undefined;
  const changes = reference ? conditionChanges(reference.checklist, signal.checklist) : [];

  // The EPS series, the fitted rate and the endpoint CAGR are all already on
  // the PEG row — that is the series the growth figure was measured from, so
  // the panel explains the label rather than computing a second opinion.
  const pegRow = byKey.get('peg');
  const pegGrowth = (pegRow?.detail ?? {}) as { epsCagr?: number | null; endpointCagr?: number | null };
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

  // Derived from the checklist and the snapshot the evaluation was made from,
  // so it describes this verdict rather than the state of the providers now.
  const quality = dataQualityOf({
    checklist: signal.checklist,
    isStale: snapshot?.is_stale,
  });

  const mine = reviewData.reviews.find((r) => r.user_id === user?.id);
  const others = reviewData.reviews.filter((r) => r.user_id !== user?.id).map(toRecord);

  const name = snapshot?.quote?.name ?? symbol;
  const lynch = docs.get(`lynch:${signal.lynch_category}`);
  const earnings = upcomingEarnings(snapshot?.quote?.nextEarningsDate);

  // The same annual EPS series the PEG card draws its sparkline from, so the
  // history here and the growth figures there cannot drift apart.
  const decline = declineContext(byKey.get('drawdown_5y')?.value ?? null);

  // Informational notes that sit alongside condition 8 without touching it.
  // Statement metrics are stored loosely typed, so each is read through a
  // helper rather than asserted into shape.
  const metricAt = (
    statement: { periods: Array<{ endDate: string; metrics: Record<string, number | null | undefined> }> } | null | undefined,
    index: number,
    key: string,
  ) => statement?.periods?.[index]?.metrics?.[key] ?? null;

  const qualityYears = (snapshot?.income_annual?.periods ?? []).map((period, i) => ({
    endDate: period.endDate,
    dilutedEps: metricAt(snapshot?.income_annual, i, 'dilutedEps'),
    dilutedShares: metricAt(snapshot?.income_annual, i, 'dilutedShares'),
    revenue: metricAt(snapshot?.income_annual, i, 'revenue'),
    freeCashFlow: metricAt(snapshot?.cash_annual, i, 'freeCashFlow'),
    operatingCashFlow: metricAt(snapshot?.cash_annual, i, 'operatingCashFlow'),
    capitalExpenditure: metricAt(snapshot?.cash_annual, i, 'capitalExpenditure'),
    stockBasedCompensation: metricAt(snapshot?.cash_annual, i, 'stockBasedCompensation'),
  }));
  const qualityNotes = earningsQualityNotes(qualityYears);

  const peers = comparePeers(
    new Map(PEER_METRICS.map((key) => [key, byKey.get(key)?.value ?? null])),
    peerRows,
  );
  const valuation = summariseValuation(
    peHistory(
      (snapshot?.price_history ?? []).map((p) => ({ date: p.date, close: p.close })),
      (byKey.get('peg')?.history ?? []) as Array<{ period: string; value: number }>,
    ),
    byKey.get('pe')?.value ?? null,
  );
  // Resolved here so the client block carries no translation bundle of its own.
  const liquidityLabels = {
    heading: tLiquidity('heading'),
    loading: tLiquidity('loading'),
    volume: tLiquidity('volume'),
    turnover: tLiquidity('turnover'),
    spread: tLiquidity('spread'),
    thin: tLiquidity('thin'),
    marketClosed: tLiquidity('marketClosed'),
    notQuoted: tLiquidity('notQuoted'),
    note: tLiquidity('note'),
  };
  const why = locale === 'nl' ? signal.why_nl : signal.why_en;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <BackLink href="/" label={tNav('backToWatchlist')} />

        {/* --- header ------------------------------------------------------ */}
        {/* The ticker leads and the price sits with it, at a size that can be
            read at a glance; the company name steps down to a subtitle rather
            than trailing the ticker at the same weight. Everything that
            classifies the company — sector, growth category, PEG basis — drops
            to a row of chips underneath, so the top of the page answers "what
            am I looking at, and what is it worth" before anything else. */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-3xl font-semibold tracking-tight text-ink">{symbol}</h1>
              {snapshot?.price != null && (
                // Formatted as money rather than a bare number with a code
                // appended: "928.70 EUR" sat three inches from a market cap
                // printed as "$34.0B" and nothing said whether the two were
                // the same currency, different currencies, or converted.
                <span className="text-xl font-medium tabular-nums text-ink-muted">
                  {formatCurrency(snapshot.price, snapshot.currency, locale)}
                </span>
              )}
            </div>
            {name && <p className="mt-0.5 truncate text-sm text-ink-subtle">{name}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Chip>{tSector(signal.focus_sector)}</Chip>
              {lynch && <Chip>{lynch.name}</Chip>}
              {/* Says on the page header what the PEG card says in a caption:
                  the valuation test was carried by expected growth. */}
              <PegBasisBadge
                basis={signal.peg_basis as 'forward' | 'trailing' | 'both' | 'none' | null}
                label={tWatchlist('pegForward')}
                title={tWatchlist('pegForwardHelp')}
              />
              {/* When the next answer arrives. Shown only when the stored date
                  is actually ahead of us — see upcomingEarnings. */}
              {earnings && (
                <Chip tone={earnings.soon ? 'accent' : 'neutral'} title={earnings.date}>
                  {earnings.daysAway === 0
                    ? tEarnings('today')
                    : earnings.daysAway === 1
                      ? tEarnings('tomorrow')
                      : earnings.soon
                        ? tEarnings('inDays', { days: earnings.daysAway })
                        : tEarnings('chip', { date: formatDate(earnings.date, locale) })}
                </Chip>
              )}
            </div>

            {/* Execution cost, beside the price it would be paid at. Never a
                condition — the nine are unchanged — so it sits outside the
                checklist entirely. */}
            <LiquidityNote symbol={symbol} locale={locale} labels={liquidityLabels} />

            {/* The way into everything this page deliberately leaves out.
                One click, and never expanded here — the ground rules keep
                the default view to the verdict and the review. */}
            <Link
              href={`/stock/${encodeURIComponent(symbol)}/research`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
            >
              {tResearch('title')}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusBadge status={signal.status} size="lg" />
            {onWatchlist && (
              <RemoveFromWatchlist
                symbol={symbol}
                labels={{
                  remove: tWatchlist('remove'),
                  removing: tWatchlist('removing'),
                  // See app/page.tsx: {symbol} is substituted on the client.
                  removed: tWatchlist.raw('removed') as string,
                  undo: tWatchlist('undo'),
                  restored: tWatchlist.raw('restored') as string,
                }}
              />
            )}
          </div>
        </div>

        {/* A stopped pipeline affects every figure on this page. */}
        <DataFreshness
          asOf={signal.as_of}
            labels={{
              updated: tData('updated', { age: '{age}' }),
              justNow: tData('justNow'),
              hoursAgo: tData.raw('hoursAgo') as string,
              daysAgo: tData.raw('daysAgo') as string,
              stale: tData.raw('stale') as string,
              veryStale: tData.raw('veryStale') as string,
              asOf: tData('asOf', { date: signal.as_of }),
            }}
          warningOnly
        />

        {snapshot?.is_stale && (
          <p className="border-near-line bg-near-wash text-near mt-4 rounded-lg border px-3 py-2 text-sm">
            {tData('staleBanner', { date: snapshot.as_of })}
          </p>
        )}

        {/* --- the mandatory "why", directly under the status badge -------- */}
        {/* Sunken rather than raised: this is the verdict explaining itself,
            so it belongs to the header above it rather than reading as the
            first of the page's several independent panels. */}
        <Card as="section" tone="sunken" className="mt-5" padding="loose">
          <SectionHeading>{tSignal('why.title')}</SectionHeading>
          <WhyBlock
            parts={signal.why_parts?.[locale] ?? null}
            prose={why}
            labels={{
              passes: tSignal('why.passes'),
              missing: tSignal('why.missing'),
              check: tSignal('why.check'),
              fullReasoning: tSignal('why.full'),
            }}
          />
          {signal.peg_basis && (
            <p className="mt-3 text-xs text-ink-subtle">
              PEG: {tSignal(`pegBasis.${signal.peg_basis}`)}
            </p>
          )}
        </Card>

        {/* --- price chart ------------------------------------------------- */}
        {snapshot?.price_history && snapshot.price_history.length > 1 && (
          <Section>
            {/* Range as links, so the choice lives in the URL and the chart
                stays readable with JavaScript off. */}
            <div className="mb-1 flex flex-wrap items-center justify-end gap-2 text-xs">
              {CHART_RANGES.map((value) => (
                <Link
                  key={value}
                  href={value === '5y' ? `/stock/${encodeURIComponent(symbol)}` : `/stock/${encodeURIComponent(symbol)}?range=${value}`}
                  aria-current={range === value ? 'true' : undefined}
                  className={
                    range === value
                      ? 'font-medium text-ink underline underline-offset-4'
                      : 'text-ink-subtle underline-offset-4 hover:text-ink hover:underline'
                  }
                >
                  {tChart(`range.${value}`)}
                </Link>
              ))}
            </div>
            <PriceChart
              points={pointsInRange(snapshot.price_history, range)}
              high={drawdownDetail.high ?? null}
              highDate={drawdownDetail.highDate ?? null}
              currency={snapshot.currency}
              locale={locale}
              labels={{
                high: tChart('high'),
                now: tChart('now'),
                drawdown: tChart('drawdown'),
                entry: tChart('entry'),
                chart: tChart('label'),
              }}
            />
          </Section>
        )}

        {/* --- the company's own valuation range ---------------------------- */}
        {/* Straight after the price chart, because the two answer halves of
            one question: that one says how far the price has fallen, this one
            says whether that made the company cheap. */}
        {valuation && (
          <Section>
            <SectionHeading>{tValuation('title')}</SectionHeading>
            <p className="-mt-1 mb-2 max-w-prose text-sm text-ink-subtle">
              {tValuation('intro')}
            </p>
            <Card>
              <ValuationRangeChart
                range={valuation}
                labels={{
                  current: tValuation('current'),
                  median: tValuation('median'),
                  low: tValuation('low'),
                  high: tValuation('high'),
                  percentileCheap: tValuation.raw('percentileCheap') as string,
                  percentileRich: tValuation.raw('percentileRich') as string,
                  footnote: tValuation('footnote'),
                }}
              />
            </Card>

            {decline && (
              // Market history, kept visually separate from the company's own
              // figures above so the two cannot be read as one claim. The
              // caveat is not small print: index odds and single-stock odds
              // differ by an order of magnitude, and conflating them is the
              // mistake this whole block could otherwise encourage.
              <Card tone="sunken" className="mt-3">
                <SectionHeading>{tDecline('heading')}</SectionHeading>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {/* The deep band needs three sentences, not one with a
                      number substituted: "0 of those were deeper than this"
                      is technically right and reads like a bug. */}
                  {tDecline
                    .raw(
                      decline.severity === 'deep'
                        ? `deep${decline.deeperInHistory}`
                        : decline.severity,
                    )
                    .replace('{total}', String(decline.totalDeclines))
                    .replace('{since}', String(1870))}{' '}
                  {tDecline
                    .raw('recovery')
                    .replace('{months}', String(decline.fastestRecoveryMonths))
                    .replace('{years}', String(decline.slowestRecoveryYears))}
                </p>
                <p className="mt-2 text-xs text-ink-faint">{tDecline('caveat')}</p>
              </Card>
            )}
          </Section>
        )}

        {/* --- buy-worthy checklist ---------------------------------------- */}
        <Section>
          <SectionHeading
            action={
              <span className="text-xs tabular-nums text-ink-subtle">
                {tStatus('conditionsMet', {
                  met: signal.conditions_met,
                  total: signal.conditions_applicable,
                })}
              </span>
            }
          >
            {tSignal('checklist')}
          </SectionHeading>
          {/* Which of the nine below rested on a figure that was not there. */}
          <DataQualityNotice
            quality={quality}
            labels={{
              unmeasured: tData.raw('quality.unmeasured') as string,
              approximated: tData.raw('quality.approximated') as string,
              stale: tData('quality.stale'),
              condition: (key) => CONDITION_LABEL[key]?.[locale] ?? key,
            }}
          />

          <ul className="divide-line border-line divide-y overflow-hidden rounded-xl border text-sm">
            {signal.checklist.map((condition) => (
              // Condition and criterion sit side by side where there is room
              // and stack where there is not. They used to share one line at
              // every width, with the name truncated — on a phone that cut
              // "Operating cash flow >= 70% of net income" down to a few words
              // and dropped exactly the part that says what is being tested.
              <li
                key={condition.key}
                className="bg-surface flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="flex min-w-0 items-start gap-2 sm:items-center">
                  <span aria-hidden="true" className="w-4 shrink-0 text-center">
                    {!condition.applicable ? '–' : condition.passed ? '✓' : '✗'}
                  </span>
                  <span
                    className={
                      !condition.applicable ? 'text-ink-faint' : undefined
                    }
                  >
                    {docs.get(`condition:${condition.key}`)?.name ?? condition.key}
                  </span>
                </span>
                <span className="text-ink-subtle pl-6 text-xs sm:shrink-0 sm:pl-0">
                  {/* The engine stores an English target on the row; the
                      localised one lives in docs/ratios.<lang>.md beside the
                      condition's name, so the criteria translate with it. */}
                  {!condition.applicable
                    ? tRatio('unavailable.not_applicable')
                    : (docs.get(`condition:${condition.key}`)?.target ?? condition.target)}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {/* --- why this growth category (the series behind the label) -------- */}
        {trajectory && (
          <GrowthTrajectory
            trajectory={trajectory}
            bandName={lynch?.name ?? null}
            formatPercent={(value) => formatPercent(value, locale)}
            formatNumber={(value) => formatNumber(value, locale)}
            labels={{
              title: tRatio('trajectory.title'),
              intro: tRatio('trajectory.intro'),
              fitted: tRatio.raw('trajectory.fitted') as string,
              endpoint: tRatio('trajectory.endpoint'),
              dips: tRatio.raw('trajectory.dips') as string,
              steady: tRatio('trajectory.steady'),
              band: tRatio('trajectory.band'),
              eps: tRatio('trajectory.eps'),
              yoy: tRatio('trajectory.yoy'),
              curve: tRatio('trajectory.curve'),
              noFit: tRatio('trajectory.noFit'),
            }}
          />
        )}

        {/* --- ratio cards -------------------------------------------------- */}
        <Section>
          {/* One column below 768px. Two columns at 640px put a ratio name, a
              value and a target into ~300px, which is where the truncation
              started; the cards are readable in one column and the grid only
              splits once there is room for them. */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {CARD_ORDER.map((key) => {
              const row = byKey.get(key as RatioRow['ratio_key']);
              if (!row) return null;
              const doc = docs.get(`ratio:${key}`);

              // PEG is judged on either the trailing or the forward figure, so
              // one number with one dot could contradict the checklist row
              // above: passed on expected growth, red dot on the trailing
              // figure. Both are shown, the one the condition used is
              // highlighted, and the dot follows the condition rather than the
              // trailing number alone.
              const pegCondition =
                key === 'peg' ? signal.checklist.find((c) => c.key === 'peg') : undefined;
              const pegDetail = (pegCondition?.detail ?? {}) as {
                trailingPeg?: number | null;
                forwardPeg?: number | null;
                trailingPasses?: boolean;
                forwardPasses?: boolean;
              };

              // The $10bn floor is stated in USD, so USD is the figure the
              // condition judges and stays the headline. The native figure sits
              // beside it, because that is the currency the price above is in.
              const capDetail =
                key === 'market_cap'
                  ? (row.detail as {
                      marketCapNative?: number | null;
                      quoteCurrency?: string | null;
                    })
                  : null;
              const capVariants =
                capDetail?.marketCapNative != null &&
                capDetail.quoteCurrency &&
                capDetail.quoteCurrency !== 'USD'
                  ? [
                      {
                        label: 'USD',
                        value: formatBillions(row.value, 'USD', locale),
                        used: true,
                      },
                      {
                        label: capDetail.quoteCurrency,
                        value: formatBillions(
                          capDetail.marketCapNative,
                          capDetail.quoteCurrency,
                          locale,
                        ),
                        used: false,
                      },
                    ]
                  : null;

              const variants = pegCondition
                ? [
                    {
                      label: tRatio('peg.trailing'),
                      value: formatNumber(pegDetail.trailingPeg ?? row.value, locale),
                      used: Boolean(pegDetail.trailingPasses),
                    },
                    {
                      label: tRatio('peg.forward'),
                      value: formatNumber(pegDetail.forwardPeg ?? null, locale),
                      used: Boolean(pegDetail.forwardPasses),
                    },
                  ]
                : capVariants;

              const color = pegCondition
                ? pegCondition.passed
                  ? 'green'
                  : 'red'
                : row.color;

              // The same fact already sits under the Why block; it belongs on
              // the card that shows the number it is about.
              let caption =
                pegCondition && signal.peg_basis
                  ? `PEG: ${tSignal(`pegBasis.${signal.peg_basis}`)}`
                  : null;

              // The drawdown is rendered neutral now, because green and red
              // mean passed and failed everywhere else on this page. Whether it
              // clears the book's entry threshold is said in words instead.
              if (key === 'drawdown_5y') {
                const dd = row.detail as {
                  meetsEntryThreshold?: boolean;
                  approachingEntryThreshold?: boolean;
                };
                if (dd.meetsEntryThreshold) caption = tRatio('entryThreshold');
                else if (dd.approachingEntryThreshold) caption = tRatio('nearEntryThreshold');
              }

              // The doc names the source in prose and the row carries it as
              // data; the card renders it once, from the data.
              // "app default" stopped being true the moment the household
              // changed the number, so the card says whose it is now. Read from
              // the current overrides rather than the stored row: a setting
              // changed today should not have to wait for tonight to be named
              // correctly, even though the figure it produced will.
              const editableKey = RATIO_THRESHOLD[key];
              const isMine = editableKey != null && isOverridden(editableKey, thresholdOverrides);
              const sourceLabel = isMine
                ? tRatio('source.your_setting')
                : tRatio(`source.${row.target_source}`);
              // The documented target is prose and does not follow the
              // threshold, so an overridden card builds its own rather than
              // printing "≤ 20 (your setting)" when the setting is 15.
              const targetLabel =
                overriddenTargetLabel(key, thresholdOverrides, (value) =>
                  formatNumber(value, locale),
                ) ?? stripSourceSuffix(doc?.target ?? row.target_label);

              const detail = row.detail as { isApproximation?: boolean };
              const adjusted = row.is_adjusted
                ? {
                    rawDisplayValue: formatPercent(row.raw_value, locale),
                    rawLabel: tRatio('adjusted.raw'),
                    adjustedLabel: tRatio('adjusted.label'),
                    note: tRatio('adjusted.roaNote'),
                    approximationNote: detail.isApproximation
                      ? tRatio('adjusted.approximation')
                      : null,
                  }
                : null;

              return (
                <RatioCard
                  key={key}
                  ratioKey={key}
                  name={doc?.name ?? key}
                  // The markdown is hard-wrapped for an editor; the card is not an
                  // editor, so the wrapping is undone and the browser decides.
                  explanation={unwrapParagraphs(doc?.explanation ?? '')}
                  displayValue={formatRatio(row, locale)}
                  color={color}
                  variants={variants}
                  caption={caption}
                  targetLabel={targetLabel}
                  targetSourceLabel={sourceLabel}
                  gateLabel={(() => {
                    const gate = checklistGate(key, locale);
                    return gate ? tRatio('gate', { value: gate }) : null;
                  })()}
                  history={row.history ?? []}
                  unavailableLabel={
                    row.value == null && row.unavailable_reason
                      ? tRatio(`unavailable.${row.unavailable_reason}`)
                      : null
                  }
                  adjusted={adjusted}
                  provenance={{
                    sources: sourcesForRatio(key, snapshot?.statement_sources),
                    asOf: signal.as_of,
                  }}
                  labels={{
                    explain: tRatio('explain'),
                    target: tRatio('target'),
                    fiveYears: tRatio('fiveYears'),
                    close: tRatio('close'),
                    source: tData.raw('metricSource') as string,
                  }}
                />
              );
            })}
          </div>
        </Section>

        {/* --- earnings quality, beside the condition it does not change ----- */}
        {qualityNotes.length > 0 && (
          <Section>
            <SectionHeading>{tQuality('heading')}</SectionHeading>
            <p className="-mt-1 mb-2 text-sm text-ink-subtle">{tQuality('intro')}</p>
            <Card tone="sunken">
              <ul className="space-y-2.5">
                {qualityNotes.map((note) => (
                  <li key={note.key} className="text-sm leading-relaxed text-ink-muted">
                    {/* `formatNumber` pads to two decimals, which turns
                        "over 3 years" into "over 3.00 years" and 8.5% into
                        8.50%. These values are already rounded to the
                        precision each one deserves, so the formatter's job
                        here is only the locale's separators. */}
                    {Object.entries(note.values).reduce(
                      (text, [key, value]) =>
                        text.replace(
                          `{${key}}`,
                          new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value),
                        ),
                      tQuality.raw(note.key) as string,
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        )}

        {/* --- how it compares with the others you follow -------------------- */}
        {peers && (
          <Section>
            <SectionHeading>{tPeers('heading')}</SectionHeading>
            <p className="-mt-1 mb-2 max-w-prose text-sm text-ink-subtle">
              {tPeers
                .raw('intro')
                .replace('{count}', String(peers.peerCount))
                .replace('{sector}', tSector(signal.focus_sector).toLowerCase())}
            </p>
            <Card>
              <PeerComparison
                summary={peers}
                labels={{
                  yours: tPeers('yours'),
                  median: tPeers('median'),
                  difference: tPeers('difference'),
                  above: tPeers.raw('above') as string,
                  below: tPeers.raw('below') as string,
                  level: tPeers('level'),
                  metric: {
                    pe: tPeers('metric.pe'),
                    roe: tPeers('metric.roe'),
                    gross_margin: tPeers('metric.gross_margin'),
                    net_margin: tPeers('metric.net_margin'),
                  },
                }}
                // Margins and returns are fractions; the multiple is not.
                format={(metric, value) =>
                  metric === 'pe'
                    ? formatNumber(value, locale)
                    : formatPercent(value, locale)
                }
              />
            </Card>
          </Section>
        )}

        {/* --- analyst estimates -------------------------------------------- */}
        {snapshot?.estimates && (
          <Section>
            <SectionHeading>{locale === 'nl' ? 'Analistenverwachtingen' : 'Analyst estimates'}</SectionHeading>
            <Card className="text-sm">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label={locale === 'nl' ? 'Verwachte WPA' : 'Next-year EPS'}
                  // Per-share money, and it was printed as a bare number. The
                  // estimates are quoted in the trading currency, which for a
                  // company filing in another one is not the currency the
                  // statements above are in.
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
                <Stat
                  label={locale === 'nl' ? 'Koersdoel' : 'Target price'}
                  value={formatCurrency(snapshot.estimates.targetPrice, snapshot.currency, locale)}
                />
              </dl>
              <p className="mt-3 text-xs text-ink-faint">
                {tData('source')}: {snapshot.estimates_source}
              </p>
            </Card>
          </Section>
        )}

        {/* --- AI thesis, beside the human judgement it is not a substitute for
             Absent entirely when no API key is configured: a card explaining
             why there is no summary is of no use to a reader who cannot act
             on it, and a placeholder in its place reads as an analysis. */}
        {thesisEnabled() && (
          <Section>
            <AiThesisCard
              // Keyed on the language so switching it remounts the card.
              // Changing language posts a server action, which re-renders the
              // tree without remounting client components — so the card kept
              // the summary it already had in state, and an English page went
              // on showing the Dutch text the server had just replaced.
              key={`${symbol}-${locale}`}
              symbol={symbol}
              lang={locale}
              thesis={summary?.thesis ?? null}
              // A thesis written against an older signal may no longer describe
              // the figures on the page, so the card says so rather than pretending.
              isStale={Boolean(summary && summary.signal_as_of !== signal.as_of)}
              generatedAt={summary?.generated_at ?? null}
              canGenerate={Boolean(user)}
              labels={{
                title: tThesis('title'),
                intro: tThesis('intro'),
                generate: tThesis('generate'),
                refresh: tThesis('refresh'),
                generating: tThesis('generating'),
                empty: tThesis('empty'),
                staleNotice: tThesis('staleNotice'),
                // {date} is only known once a generation finishes, on the client.
                generatedAt: tThesis.raw('generatedAt') as string,
                error: tThesis('error'),
                signedOut: tThesis('signedOut'),
                failed: {
                  truncated: tThesis('failed.truncated'),
                  no_text: tThesis('failed.no_text'),
                  api: tThesis('failed.api'),
                  disabled: tThesis('failed.disabled'),
                  missing_symbol: tThesis('failed.missing_symbol'),
                  not_signed_in: tThesis('failed.not_signed_in'),
                  no_signal: tThesis('failed.no_signal'),
                  save_failed: tThesis('failed.save_failed'),
                  unknown: tThesis('failed.unknown'),
                },
              }}
            />
          </Section>
        )}

        {/* --- what has moved since last time (the stored evaluations) -------- */}
        <ConditionTrend
          trend={trend}
          changes={changes}
          labels={{
            title: tSignal('trend.title'),
            summary: tSignal.raw('trend.summary') as string,
            steady: tSignal.raw('trend.steady') as string,
            changesSince: tSignal.raw('trend.changesSince') as string,
            started: tSignal('trend.started'),
            stopped: tSignal('trend.stopped'),
            tooSoon: tSignal('trend.tooSoon'),
            condition: (key) => CONDITION_LABEL[key]?.[locale] ?? key,
          }}
        />

        {/* --- what you own, above the sell signals it gives meaning to ------ */}
        <PositionBlock
          symbol={symbol}
          position={position}
          currency={snapshot?.currency ?? null}
          summary={
            position
              ? (() => {
                  const result = positionReturn(position, snapshot?.price ?? null);
                  return {
                    change: result.change == null ? null : formatPercent(result.change, locale),
                    value:
                      result.value == null
                        ? null
                        : formatCurrency(result.value, snapshot?.currency ?? null, locale),
                    gain:
                      result.gain == null
                        ? null
                        : formatCurrency(result.gain, snapshot?.currency ?? null, locale),
                    days: result.daysHeld,
                  };
                })()
              : null
          }
          labels={{
            title: tPosition('title'),
            intro: tPosition('intro'),
            add: tPosition('add'),
            edit: tPosition('edit'),
            entryPrice: tPosition('entryPrice'),
            entryDate: tPosition('entryDate'),
            quantity: tPosition('quantity'),
            quantityHint: tPosition('quantityHint'),
            note: tPosition('note'),
            save: tPosition('save'),
            saving: tPosition('saving'),
            clear: tPosition('clear'),
            clearing: tPosition('clearing'),
            cancel: tPosition('cancel'),
            since: tPosition('since'),
            held: tPosition.raw('held') as string,
            value: tPosition('value'),
            gain: tPosition('gain'),
            saved: tPosition('saved'),
            cleared: tPosition('cleared'),
            errors: {
              price: tPosition('errors.price'),
              date: tPosition('errors.date'),
              future: tPosition('errors.future'),
              quantity: tPosition('errors.quantity'),
              not_signed_in: tPosition('errors.notSignedIn'),
              unknown: tPosition('errors.unknown'),
            },
          }}
        />

        {/* --- the judgement the app cannot make (section 8) ------------------ */}
        <QualitativeReview
          symbol={symbol}
          mine={mine ? toRecord(mine) : null}
          others={others}
          history={reviewData.history}
          conditionsMet={signal.conditions_met}
          conditionsApplicable={signal.conditions_applicable}
          docs={docs}
        />

        {/* --- provenance ---------------------------------------------------- */}
        <div className="mt-8">
          <DataFreshness
            asOf={signal.as_of}
              labels={{
                updated: tData('updated', { age: '{age}' }),
                justNow: tData('justNow'),
                hoursAgo: tData.raw('hoursAgo') as string,
                daysAgo: tData.raw('daysAgo') as string,
                stale: tData.raw('stale') as string,
                veryStale: tData.raw('veryStale') as string,
                asOf: tData('asOf', { date: signal.as_of }),
              }}
          />
        </div>
        <p className="mt-1 text-xs text-ink-faint">
          {snapshot?.statement_sources?.income
            ? `${tData('source')}: ${snapshot.statement_sources.income}`
            : ''}
          {/* "EUR / USD" told the reader two codes and no relation. Which
              figures are in which currency is the thing the page has to say,
              because it shows all three: the price, the statements, and the
              $10bn rule that is written in USD. */}
          {snapshot?.currency
            ? ` · ${tData('currencies', {
                quote: snapshot.currency,
                filing: snapshot.filing_currency ?? snapshot.currency,
              })}`
            : ''}
        </p>
      </main>
    </>
  );
}

