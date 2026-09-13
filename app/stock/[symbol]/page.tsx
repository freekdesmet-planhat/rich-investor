import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PriceChart } from '@/components/PriceChart';
import { RatioCard } from '@/components/RatioCard';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { AiThesisCard } from '@/components/AiThesisCard';
import { QualitativeReview, type ReviewRecord } from '@/components/review/QualitativeReview';
import { createClient } from '@/lib/supabase/server';
import {
  getRatios,
  getReviews,
  getSignal,
  getSnapshot,
  getTickerSummary,
  getTranslations as getDocTranslations,
  type RatioRow,
} from '@/lib/data/queries';
import type { Lang } from '@/lib/i18n/config';
import { formatBillions, formatNumber, formatPercent } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';

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

export default async function StockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  const locale = (await getLocale()) as Lang;

  const signal = await getSignal(symbol);
  if (!signal) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [ratios, snapshot, docs, reviewData, summary, tRatio, tSignal, tData, tSector, tStatus, tThesis] =
    await Promise.all([
    getRatios(symbol, signal.as_of),
    getSnapshot(symbol),
    getDocTranslations(locale),
    getReviews(symbol),
    getTickerSummary(symbol),
    getTranslations('ratio'),
    getTranslations('signal'),
    getTranslations('data'),
    getTranslations('sector'),
    getTranslations('status'),
    getTranslations('thesis'),
  ]);

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

  const mine = reviewData.reviews.find((r) => r.user_id === user?.id);
  const others = reviewData.reviews.filter((r) => r.user_id !== user?.id).map(toRecord);

  const name = snapshot?.quote?.name ?? symbol;
  const lynch = docs.get(`lynch:${signal.lynch_category}`);
  const why = locale === 'nl' ? signal.why_nl : signal.why_en;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link
          href="/"
          className="text-sm text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
        >
          ←
        </Link>

        {/* --- header ------------------------------------------------------ */}
        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">
              {symbol}
              <span className="ml-2 text-base font-normal text-slate-500 dark:text-slate-400">
                {name}
              </span>
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              <span>{tSector(signal.focus_sector)}</span>
              {lynch && (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                  {lynch.name}
                </span>
              )}
              {snapshot?.price != null && (
                <span className="tabular-nums">
                  {formatNumber(snapshot.price, locale)} {snapshot.currency}
                </span>
              )}
            </p>
          </div>
          <StatusBadge status={signal.status} size="lg" />
        </div>

        {snapshot?.is_stale && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            {tData('staleBanner', { date: snapshot.as_of })}
          </p>
        )}

        {/* --- the mandatory "why", directly under the status badge -------- */}
        <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            {tSignal('why')}
          </h2>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{why}</p>
          {signal.peg_basis && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              PEG: {tSignal(`pegBasis.${signal.peg_basis}`)}
            </p>
          )}
        </section>

        {/* --- price chart ------------------------------------------------- */}
        {snapshot?.price_history && snapshot.price_history.length > 1 && (
          <section className="mt-6">
            <PriceChart
              points={snapshot.price_history}
              high={drawdownDetail.high ?? null}
              highDate={drawdownDetail.highDate ?? null}
              currency={snapshot.currency}
              labels={{
                high: locale === 'nl' ? '5-jaarstop' : '5y high',
                now: locale === 'nl' ? 'Nu' : 'Now',
                drawdown: locale === 'nl' ? 'Daling' : 'Drawdown',
              }}
            />
          </section>
        )}

        {/* --- buy-worthy checklist ---------------------------------------- */}
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            {tSignal('checklist')}{' '}
            <span className="font-normal text-slate-500 dark:text-slate-400">
              — {tStatus('conditionsMet', {
                met: signal.conditions_met,
                total: signal.conditions_applicable,
              })}
            </span>
          </h2>
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            {signal.checklist.map((condition) => (
              <li
                key={condition.key}
                className="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-slate-900"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="w-4 shrink-0 text-center">
                    {!condition.applicable ? '–' : condition.passed ? '✓' : '✗'}
                  </span>
                  <span
                    className={
                      !condition.applicable
                        ? 'truncate text-slate-400 dark:text-slate-500'
                        : 'truncate'
                    }
                  >
                    {docs.get(`condition:${condition.key}`)?.name ?? condition.key}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                  {!condition.applicable
                    ? tRatio('unavailable.not_applicable')
                    : condition.target}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* --- ratio cards -------------------------------------------------- */}
        <section className="mt-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CARD_ORDER.map((key) => {
              const row = byKey.get(key as RatioRow['ratio_key']);
              if (!row) return null;
              const doc = docs.get(`ratio:${key}`);

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
                  explanation={doc?.explanation ?? ''}
                  displayValue={formatRatio(row, locale)}
                  color={row.color}
                  targetLabel={doc?.target ?? row.target_label}
                  targetSourceLabel={tRatio(`source.${row.target_source}`)}
                  history={row.history ?? []}
                  unavailableLabel={
                    row.value == null && row.unavailable_reason
                      ? tRatio(`unavailable.${row.unavailable_reason}`)
                      : null
                  }
                  adjusted={adjusted}
                  labels={{
                    explain: tRatio('explain'),
                    target: tRatio('target'),
                    fiveYears: tRatio('fiveYears'),
                    close: locale === 'nl' ? 'Sluiten' : 'Close',
                  }}
                />
              );
            })}
          </div>
        </section>

        {/* --- analyst estimates -------------------------------------------- */}
        {snapshot?.estimates && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              {locale === 'nl' ? 'Analistenverwachtingen' : 'Analyst estimates'}
            </h2>
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label={locale === 'nl' ? 'Verwachte WPA' : 'Next-year EPS'}
                  value={formatNumber(snapshot.estimates.nextYearEps, locale)}
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
                  value={formatNumber(snapshot.estimates.targetPrice, locale)}
                />
              </dl>
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                {tData('source')}: {snapshot.estimates_source}
              </p>
            </div>
          </section>
        )}

        {/* --- AI thesis, beside the human judgement it is not a substitute for */}
        <section className="mt-8">
          <AiThesisCard
            symbol={symbol}
            // Prefer the active language; fall back to the other rather than
            // showing an empty card, and say which one is on screen.
            thesis={
              (locale === 'nl' ? summary?.thesis_nl : summary?.thesis_en) ??
              (locale === 'nl' ? summary?.thesis_en : summary?.thesis_nl) ??
              null
            }
            isMock={summary?.is_mock ?? false}
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
              mockNotice: tThesis('mockNotice'),
              staleNotice: tThesis('staleNotice'),
              generatedAt: tThesis('generatedAt'),
              error: tThesis('error'),
              signedOut: tThesis('signedOut'),
              langMismatch:
                summary && !(locale === 'nl' ? summary.thesis_nl : summary.thesis_en)
                  ? tThesis('langMismatch', {
                      lang: locale === 'nl' ? 'English' : 'Nederlands',
                    })
                  : null,
            }}
          />
        </section>

        {/* --- the judgement the app cannot make (section 8) ------------------ */}
        <QualitativeReview
          symbol={symbol}
          mine={mine ? toRecord(mine) : null}
          others={others}
          conditionsMet={signal.conditions_met}
          conditionsApplicable={signal.conditions_applicable}
          docs={docs}
        />

        {/* --- provenance ---------------------------------------------------- */}
        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          {tData('asOf', { date: signal.as_of })}
          {snapshot?.statement_sources?.income
            ? ` · ${tData('source')}: ${snapshot.statement_sources.income}`
            : ''}
          {snapshot?.filing_currency && snapshot.filing_currency !== snapshot.currency
            ? ` · ${snapshot.currency} / ${snapshot.filing_currency}`
            : ''}
        </p>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}
