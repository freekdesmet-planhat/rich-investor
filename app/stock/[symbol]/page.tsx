import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PriceChart } from '@/components/PriceChart';
import { BackLink } from '@/components/BackLink';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { AiThesisCard } from '@/components/AiThesisCard';
import { RemoveFromWatchlist } from '@/components/RemoveFromWatchlist';
import { DataFreshness } from '@/components/DataFreshness';
import { StockFreshness } from '@/components/StockFreshness';
import { QualitativeReview, type ReviewRecord } from '@/components/review/QualitativeReview';
import { PegBasisBadge } from '@/components/PegBasisBadge';
import { Card, Chip, Section, SectionHeading } from '@/components/ui/Surface';
import { RatioGrid, HEADLINE_RATIOS } from '@/components/RatioGrid';
import { createClient } from '@/lib/supabase/server';
import {
  getListingExchange,
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
} from '@/lib/data/queries';
import type { Lang } from '@/lib/i18n/config';
import { buildTrend, conditionChanges } from '@/lib/data/trend';
import { buildStockFreshness } from '@/lib/data/stockFreshness';
import { dataQualityOf } from '@/lib/data/dataQuality';
import { DataQualityNotice } from '@/components/DataQualityNotice';
import { WhyBlock } from '@/components/WhyBlock';
import { PositionBlock } from '@/components/PositionBlock';
import { positionReturn } from '@/lib/data/position';
import { CHART_RANGES, isChartRange, pointsInRange, type ChartRange } from '@/lib/data/priceRange';
import { CONDITION_LABEL } from '@/lib/signal/explain';
import { upcomingEarnings } from '@/lib/data/earnings';
import { LiquidityNote } from '@/components/LiquidityNote';
import { comparePeers, PEER_METRICS } from '@/lib/data/peerComparison';
import { formatCurrency, formatDate, formatPercent } from '@/lib/i18n/format';
import { thesisEnabled } from '@/lib/ai/thesis';

export const dynamic = 'force-dynamic';

/** A quarter of stored evaluations: long enough to show a recovery forming. */
const TREND_DAYS = 90;

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

  const [ratios, snapshot, docs, reviewData, position, history, thresholdOverrides, summary, tRatio, tSignal, tData, tSector, tStatus, tThesis, tChart, tNav, tPosition, tEarnings, tLiquidity, tResearch, peerRows, listingExchange] =
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
    getTranslations('research'),
    getSectorPeerRatios(signal.focus_sector, signal.as_of, symbol, PEER_METRICS),
    getListingExchange(symbol),
  ]);

  const tWatchlist = await getTranslations('watchlist');
  const onWatchlist = (await getWatchlistSymbols()).has(symbol);

  // The two facts the old "Updated 17h ago · As of <date>" line got wrong: how
  // old the price is and which report the fundamentals come from (A5). The age
  // now comes from the analysis timestamp, not the as-of date at midnight.
  const priceCloseDate = snapshot?.price_history?.length
    ? snapshot.price_history.reduce((latest, p) => (p.date > latest ? p.date : latest), snapshot.price_history[0].date)
    : null;
  const freshness = buildStockFreshness({
    createdAt: signal.created_at,
    priceCloseDate,
    exchangeCode: listingExchange,
    fiscalYearEndDate: snapshot?.income_annual?.periods?.[0]?.endDate ?? null,
    locale,
    labels: {
      updated: tData('updated', { age: '{age}' }),
      justAnalysed: tData('justAnalysed'),
      justNow: tData('justNow'),
      hoursAgo: tData.raw('hoursAgo') as string,
      daysAgo: tData.raw('daysAgo') as string,
      priceClose: tData.raw('priceClose') as string,
      priceCloseNoExchange: tData.raw('priceCloseNoExchange') as string,
      financials: tData.raw('financials') as string,
    },
  });

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
  // The condition trend is no longer a block of its own; it folds into the
  // checklist as a per-row marker on the conditions that flipped since the
  // reference evaluation. Keyed for a quick lookup while rendering the rows.
  const changeByKey = new Map(changes.map((c) => [c.key, c.gained]));

  // Derived from the checklist and the snapshot the evaluation was made from,
  // so it describes this verdict rather than the state of the providers now.
  const quality = dataQualityOf({
    checklist: signal.checklist,
    isStale: snapshot?.is_stale,
  });

  const mine = reviewData.reviews.find((r) => r.user_id === user?.id);
  const others = reviewData.reviews.filter((r) => r.user_id !== user?.id).map(toRecord);

  // The cached AI summary is shown only while it still describes the current
  // signal. A changed verdict (status or conditions met) hides it, so a stale
  // summary is never shown behind a warning; the reader regenerates instead. Rows
  // written before the fingerprint existed fall back to the as-of comparison (A7).
  const summaryLive =
    summary != null &&
    (summary.signal_status != null
      ? summary.signal_status === signal.status &&
        summary.signal_conditions_met === signal.conditions_met
      : summary.signal_as_of === signal.as_of);

  const name = snapshot?.quote?.name ?? symbol;
  const lynch = docs.get(`lynch:${signal.lynch_category}`);
  const earnings = upcomingEarnings(snapshot?.quote?.nextEarningsDate);

  // Peer comparison is no longer a section; it survives as a one-line caption
  // on the headline ratio cards below (and on the full grid in Full research).
  // Computed here, unchanged, and handed to the grid.
  const peers = comparePeers(
    new Map(PEER_METRICS.map((key) => [key, byKey.get(key)?.value ?? null])),
    peerRows,
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
        <div className="mt-4">
          {/* Identity and the verdict share one row, and both are bounded: the
              ticker and price on the left, the status pill and Remove on the
              right. Everything that can grow — the classifying chips, the
              tradability line — drops below, so a long tradability line can no
              longer push the verdict pill out of the header (audit 27). */}
          <div className="flex items-start justify-between gap-x-6">
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
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <StatusBadge status={signal.status} size="lg" />
              {/* Always mounted, gated on `member` inside: removing revalidates
                  this page, and a gate here would unmount the "Removed · Undo" the
                  click just produced (audit A6). */}
              <RemoveFromWatchlist
                symbol={symbol}
                member={onWatchlist}
                labels={{
                  remove: tWatchlist('remove'),
                  removing: tWatchlist('removing'),
                  // See app/page.tsx: {symbol} is substituted on the client.
                  removed: tWatchlist.raw('removed') as string,
                  undo: tWatchlist('undo'),
                  restored: tWatchlist.raw('restored') as string,
                }}
              />
            </div>
          </div>

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

        {/* --- buy-worthy checklist ---------------------------------------- */}
        <Section>
          <SectionHeading
            action={
              <span className="text-xs tabular-nums text-ink-subtle">
                {tStatus('conditionsMet', {
                  met: signal.conditions_met,
                  total: signal.conditions_applicable,
                })}
                {(() => {
                  // Conditions demoted to grey by the sanity layer are counted and
                  // unmet, but named apart from a genuine miss (A4): "can't be
                  // judged", not "failed".
                  const unjudged = (signal.checklist ?? []).filter((c) => c.unjudged);
                  if (unjudged.length === 0) return null;
                  return (
                    <>
                      {' · '}
                      {tStatus('cantJudge', {
                        count: unjudged.length,
                        names: unjudged
                          .map((c) => CONDITION_LABEL[c.key]?.[locale] ?? c.key)
                          .join(', '),
                      })}
                    </>
                  );
                })()}
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

          {/* What changed since the reference evaluation, named here rather
              than in a block of its own further down — the per-row markers
              below carry the detail, this line carries the date. */}
          {changes.length > 0 && reference && (
            <p className="mb-2 text-xs text-ink-subtle">
              {(tSignal.raw('trend.changesSince') as string).replace('{date}', reference.as_of)}
            </p>
          )}

          <ul className="divide-line border-line divide-y overflow-hidden rounded-xl border text-sm">
            {signal.checklist.map((condition) => {
              const flipped = changeByKey.get(condition.key);
              return (
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
                  {/* The condition-trend delta, folded in: only on rows that
                      flipped since the reference, coloured the way a pass and a
                      fail are coloured everywhere else. */}
                  {flipped !== undefined && (
                    <span
                      className={`shrink-0 text-xs font-medium ${flipped ? 'text-pass' : 'text-fail'}`}
                    >
                      {flipped ? '↑' : '↓'} {tSignal(flipped ? 'delta.gained' : 'delta.lost')}
                    </span>
                  )}
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
              );
            })}
          </ul>
        </Section>

        {/* --- headline ratios, with the way to the full twenty ------------ */}
        {/* The default view carries the decision path and a handful of headline
            figures; the full twenty-card grid, and the valuation, growth and
            quality panels, live one click away in Full research. */}
        <Section>
          <SectionHeading
            action={
              <Link
                href={`/stock/${encodeURIComponent(symbol)}/research?section=analysis`}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
              >
                {tRatio('seeAll')}
                <span aria-hidden="true">→</span>
              </Link>
            }
          >
            {tRatio('headline')}
          </SectionHeading>
          <RatioGrid
            keys={HEADLINE_RATIOS}
            byKey={byKey}
            signal={signal}
            docs={docs}
            snapshot={snapshot}
            thresholdOverrides={thresholdOverrides}
            peers={peers}
            locale={locale}
          />
        </Section>

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
              // Hidden once the signal has moved, so a stale summary is never shown.
              thesis={summaryLive ? summary!.thesis : null}
              generatedAt={summaryLive ? summary!.generated_at : null}
              // The figures the summary is written from are this evaluation's.
              figuresAsOf={signal.as_of}
              canGenerate={Boolean(user)}
              labels={{
                title: tThesis('title'),
                intro: tThesis('intro'),
                generate: tThesis('generate'),
                refresh: tThesis('refresh'),
                generating: tThesis('generating'),
                empty: tThesis('empty'),
                // {date} is only known once a generation finishes, on the client.
                generatedAt: tThesis.raw('generatedAt') as string,
                figuresAsOf: tThesis.raw('figuresAsOf') as string,
                error: tThesis('error'),
                signedOut: tThesis('signedOut'),
                failed: {
                  truncated: tThesis('failed.truncated'),
                  no_text: tThesis('failed.no_text'),
                  numbers: tThesis('failed.numbers'),
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
        {/* Not a single "As of <date>": how old the price is and which annual
            report the fundamentals come from are separate facts, and the age
            reads from the analysis timestamp so a fresh run says "Just analysed"
            rather than "17h ago" (A5). The stale banner still lives at the top. */}
        <div className="mt-8">
          <StockFreshness {...freshness} />
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
