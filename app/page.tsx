import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { MarketContextDashboard } from '@/components/MarketContextDashboard';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { RemoveFromWatchlist } from '@/components/RemoveFromWatchlist';
import { WatchlistControls } from '@/components/WatchlistControls';
import { ChangedRecently } from '@/components/ChangedRecently';
import { TrendCell, type TrendLabels } from '@/components/TrendCell';
import { PegBasisBadge } from '@/components/PegBasisBadge';
import { AnalyseNow, type AnalyseLabels } from '@/components/AnalyseNow';
import { DataFreshness } from '@/components/DataFreshness';
import {
  getMyReviewSummaries,
  getTranslations as getDocTranslations,
  getTrends,
  getWatchlist,
  hasSeenPrimer,
  type WatchlistEntry,
} from '@/lib/data/queries';
import { movers, within, type Trend } from '@/lib/data/trend';
import { CONDITION_LABEL } from '@/lib/signal/explain';
import {
  filterEntries,
  growthCounts,
  isGrowthFilter,
  isReviewFilter,
  isSortKey,
  isStatusFilter,
  reviewCounts,
  reviewMarkOf,
  sectorCounts,
  sortEntries,
  statusCounts,
  type ViewOptions,
} from '@/lib/data/watchlistView';
import type { FocusSector } from '@/lib/sectors/mapping';
import type { Lang } from '@/lib/i18n/config';
import { SectionHeading } from '@/components/ui/Surface';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** How far back the row sparkline reaches: a quarter, the book's own cadence. */
const TREND_DAYS = 90;

/** What "recently" means in the changed-recently block. */
const RECENT_DAYS = 7;

/** The four focus sectors, in the order the book introduces them (chapter 2). */
const SECTOR_ORDER: FocusSector[] = [
  'information_technology',
  'luxury_consumer',
  'entertainment_media',
  'financial_services_non_bank',
  'outside_focus',
];

function groupBySector(entries: WatchlistEntry[]): Map<FocusSector, WatchlistEntry[]> {
  const groups = new Map<FocusSector, WatchlistEntry[]>();
  for (const sector of SECTOR_ORDER) groups.set(sector, []);
  for (const entry of entries) {
    const bucket = groups.get(entry.focus_sector) ?? groups.get('outside_focus')!;
    bucket.push(entry);
  }
  for (const [sector, rows] of groups) if (rows.length === 0) groups.delete(sector);
  return groups;
}

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    sort?: string;
    q?: string;
    review?: string;
    growth?: string;
    sector?: string;
  }>;
}) {
  // A first sign-in lands here, so this is where the primer is offered. A
  // redirect rather than a modal over the page: a dialog would be covering
  // the one screen a new member is trying to make sense of, and it would be
  // the only part of the app you cannot link to or come back to.
  if (!(await hasSeenPrimer())) redirect('/how-it-works');

  const params = await searchParams;
  const locale = (await getLocale()) as Lang;
  const view: ViewOptions = {
    status: isStatusFilter(params.status) ? params.status : 'all',
    sort: isSortKey(params.sort) ? params.sort : 'sector',
    query: params.q ?? '',
    review: isReviewFilter(params.review) ? params.review : 'any',
    growth: isGrowthFilter(params.growth) ? params.growth : 'any',
    // Any focus sector the app knows; anything else falls back to no filter
    // rather than silently matching nothing.
    sector:
      params.sector && (SECTOR_ORDER as string[]).includes(params.sector) ? params.sector : 'any',
  };

  const [tStatus, tSector, tNav, tData, tWatchlist, tSearch, tReview, tAnalyse] = await Promise.all([
    getTranslations('status'),
    getTranslations('sector'),
    getTranslations('nav'),
    getTranslations('data'),
    getTranslations('watchlist'),
    getTranslations('search'),
    getTranslations('review'),
    getTranslations('analyse'),
  ]);

  // Membership decides what is listed. The signal only decides what a row says:
  // a ticker added today has none until the nightly job runs, and it belongs on
  // the page from the moment it is added rather than the morning after.
  const all = await getWatchlist();

  // Your own reviews, keyed by ticker. The watchlist is shared and a review is
  // not, so this says which names *you* have answered — the other member's
  // verdict is on the stock page, where it can be attributed.
  const reviews = await getMyReviewSummaries();

  // The growth-band names live in docs/ratios.<lang>.md beside their
  // explanations, like every other piece of framework vocabulary in the app.
  const docs = await getDocTranslations(locale);
  const bandName = (key: string) => docs.get(`lynch:${key}`)?.name ?? key;

  // One fetch over the long window; the week's movers are a narrower reading of
  // the same rows rather than a second round trip.
  const trends = await getTrends(all.map((e) => e.symbol), TREND_DAYS);
  const recent = movers(
    [...trends.values()].map((t) => within(t, RECENT_DAYS)).filter((t): t is Trend => t != null),
  );

  // Counts come from the whole list, never the filtered one: a chip that
  // recounted itself after being clicked could only ever show its own total.
  const counts = statusCounts(all);
  const reviewTotals = reviewCounts(all, reviews);
  const growthTotals = growthCounts(all);
  const sectors = sectorCounts(all, SECTOR_ORDER);
  const visible = sortEntries(filterEntries(all, view, reviews), view.sort);
  // Sector is a sort option now, so the grouped layout belongs to that option
  // alone; any other ordering would be cut apart by the group headings.
  const groups = view.sort === 'sector' ? groupBySector(visible) : null;

  const asOf = all.find((e) => e.signal)?.signal?.as_of;

  const rowLabels = {
    conditionsMet: (met: number, total: number) => tStatus('conditionsMet', { met, total }),
    /**
     * Your own verdict, on the row.
     *
     * The review is the one thing in the app nothing else can supply, and until
     * now the watchlist gave no sign of which names had one — so the question
     * "which of these have I actually thought about" meant opening all of them.
     * Unanswered says so explicitly rather than staying silent, because silence
     * is what it looked like before.
     */
    review: (entry: WatchlistEntry) => {
      const mark = reviewMarkOf(reviews.get(entry.symbol));
      if (!mark.done) return { text: tWatchlist('reviewNeeded'), done: false };
      return {
        text: tWatchlist('reviewed', {
          assessment: tReview(`assessment.${mark.assessment}`),
          date: mark.date,
        }),
        done: true,
      };
    },
    pending: tWatchlist('pending'),
    notAnalysed: tWatchlist('notAnalysed'),
    /**
     * The one condition standing in the way, when there is exactly one.
     *
     * ADBE and GOOGL both sit at 8 of 9 and wear different badges, because
     * "almost there" also requires the first three conditions to hold and
     * ADBE's missing one is among them. The count alone cannot explain that;
     * the name of the condition can, and it saves opening the page at all.
     */
    missingOne: (entry: WatchlistEntry) => {
      const signal = entry.signal;
      if (!signal || signal.status === 'buy_worthy') return null;
      const missing = signal.checklist.filter((c) => c.applicable && !c.passed);
      if (missing.length !== 1) return null;
      const label = CONDITION_LABEL[missing[0].key]?.[locale] ?? missing[0].key;
      return tWatchlist('missingOne', { condition: label });
    },
  };

  const analyseLabels: AnalyseLabels = {
    analyse: tAnalyse('analyse'),
    analysing: tAnalyse('analysing'),
    done: tAnalyse.raw('done') as string,
    failed: tAnalyse('failed'),
    noData: tAnalyse('noData'),
  };

  const pegLabels = {
    label: tWatchlist('pegForward'),
    title: tWatchlist('pegForwardHelp'),
  };

  const trendLabels = {
    gained: tWatchlist.raw('trendGained') as string,
    lost: tWatchlist.raw('trendLost') as string,
    steady: tWatchlist('trendSteady'),
    chart: tWatchlist.raw('trendChart') as string,
  };

  const removeLabels = {
    remove: tWatchlist('remove'),
    removing: tWatchlist('removing'),
    // `.raw` because {symbol} is filled in on the client, where the row is
    // known. Formatting here without the value raises FORMATTING_ERROR and
    // yields a string the reader cannot use.
    removed: tWatchlist.raw('removed') as string,
    undo: tWatchlist('undo'),
    restored: tWatchlist.raw('restored') as string,
  };

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Market weather first: the book reads it as context for the hunt,
            not as a signal, so it sits above the watchlist rather than in it. */}
        <MarketContextDashboard />

        {/* A stopped pipeline is the one thing worth interrupting the page for:
            every number below it is quietly out of date. */}
        <DataFreshness
          asOf={asOf}
              labels={{
                updated: tData('updated', { age: '{age}' }),
                justNow: tData('justNow'),
                hoursAgo: tData.raw('hoursAgo') as string,
                daysAgo: tData.raw('daysAgo') as string,
                stale: tData.raw('stale') as string,
                veryStale: tData.raw('veryStale') as string,
                asOf: asOf ? tData('asOf', { date: asOf }) : '',
              }}
          warningOnly
        />

        {/* What moved, before the list of everything. On a quiet week this
            renders nothing rather than restating the whole watchlist. */}
        <ChangedRecently
          movers={recent}
          days={RECENT_DAYS}
          labels={{
            title: tWatchlist('changedTitle'),
            intro: tWatchlist.raw('changedIntro') as string,
            gained: tWatchlist.raw('changedGained') as string,
            lost: tWatchlist.raw('changedLost') as string,
            moved: tWatchlist.raw('changedMoved') as string,
            status: {
              buy_worthy: tStatus('short.buy_worthy'),
              almost: tStatus('short.almost'),
              watching: tStatus('short.watching'),
            },
          }}
        />

        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-xl font-semibold">{tNav('watchlist')}</h1>
            {/* The counts used to be printed here as prose and then left you to
                scroll for them; they are the chips below now. */}
            <p className="text-ink-subtle text-sm">
              {tWatchlist('showing', { shown: visible.length, total: all.length })}
            </p>
          </div>
          <Link
            href="/search"
            className="border-line-strong text-ink-muted hover:bg-surface-hover rounded-md border px-3 py-1.5 text-sm transition"
          >
            {tSearch('title')}
          </Link>
        </div>

        {all.length > 0 && (
          <WatchlistControls
            view={view}
            counts={counts}
            labels={{
              status: {
                all: tWatchlist('all'),
                // The badge labels are whole sentences — "Buy-worthy, over to
                // your qualitative review" — which is right on a badge and far
                // too long on a chip.
                buy_worthy: tStatus('short.buy_worthy'),
                almost: tStatus('short.almost'),
                watching: tStatus('short.watching'),
              },
              sortBy: tWatchlist('sortBy'),
              sort: {
                sector: tWatchlist('sortSector'),
                conditions: tWatchlist('sortConditions'),
                drawdown: tWatchlist('sortDrawdown'),
                symbol: tWatchlist('sortSymbol'),
              },
              filterPlaceholder: tWatchlist('filterPlaceholder'),
              filterApply: tWatchlist('filterApply'),
              clear: tWatchlist('clear'),
              review: {
                any: tWatchlist('reviewAny'),
                needed: tWatchlist('reviewNeededFilter'),
                reviewed: tWatchlist('reviewedFilter'),
              },
              reviewBy: tWatchlist('reviewBy'),
              growthBy: tWatchlist('growthBy'),
              growth: {
                any: tWatchlist('growthAny'),
                high_growth: bandName('high_growth'),
                average_growth: bandName('average_growth'),
                low_growth: bandName('low_growth'),
                outside: tWatchlist('growthOutside'),
              },
              sectorBy: tWatchlist('sectorBy'),
              anySector: tWatchlist('sectorAny'),
              sector: Object.fromEntries(SECTOR_ORDER.map((key) => [key, tSector(key)])),
            }}
            reviewCounts={reviewTotals}
            growthCounts={growthTotals}
            sectors={sectors}
          />
        )}

        {all.length === 0 && (
          <p className="border-line-strong text-ink-subtle rounded-lg border border-dashed p-6 text-center text-sm">
            {tWatchlist('empty')}
          </p>
        )}

        {/* A filter that matches nothing is a different state from an empty
            watchlist, and saying so is what stops it reading as data loss. */}
        {all.length > 0 && visible.length === 0 && (
          <p className="border-line-strong text-ink-subtle rounded-lg border border-dashed p-6 text-center text-sm">
            {tWatchlist('noMatches')}
          </p>
        )}

        <div className="space-y-8">
          {groups
            ? [...groups].map(([sector, rows]) => (
                <section key={sector}>
                  <SectionHeading>{tSector(sector)}
                    {sector === 'outside_focus' && (
                      <span className="ml-2 rounded bg-near-wash px-1.5 py-0.5 text-xs font-normal text-near">
                        !
                      </span>
                    )}</SectionHeading>
                  <RowList
                    rows={rows}
                    labels={rowLabels}
                    removeLabels={removeLabels}
                    trends={trends}
                    trendLabels={trendLabels}
                    pegLabels={pegLabels}
                    analyseLabels={analyseLabels}
                  />
                </section>
              ))
            : visible.length > 0 && (
                <RowList
                  rows={visible}
                  labels={rowLabels}
                  removeLabels={removeLabels}
                  trends={trends}
                  trendLabels={trendLabels}
                  pegLabels={pegLabels}
                  analyseLabels={analyseLabels}
                />
              )}
        </div>

        <div className="mt-8">
          <DataFreshness
            asOf={asOf}
              labels={{
                updated: tData('updated', { age: '{age}' }),
                justNow: tData('justNow'),
                hoursAgo: tData.raw('hoursAgo') as string,
                daysAgo: tData.raw('daysAgo') as string,
                stale: tData.raw('stale') as string,
                veryStale: tData.raw('veryStale') as string,
                asOf: asOf ? tData('asOf', { date: asOf }) : '',
              }}
          />
        </div>
      </main>
    </>
  );
}

interface RowLabels {
  conditionsMet: (met: number, total: number) => string;
  pending: string;
  notAnalysed: string;
  missingOne: (entry: WatchlistEntry) => string | null;
  review: (entry: WatchlistEntry) => { text: string; done: boolean };
}

/**
 * The rows, one list.
 *
 * Shared by the sector-grouped layout and the flat one, so the two orderings
 * cannot drift into rendering a row differently.
 */
function RowList({
  rows,
  labels,
  removeLabels,
  trends,
  trendLabels,
  pegLabels,
  analyseLabels,
}: {
  rows: WatchlistEntry[];
  labels: RowLabels;
  removeLabels: {
    remove: string;
    removing: string;
    removed: string;
    undo: string;
    restored: string;
  };
  trends: Map<string, Trend>;
  trendLabels: TrendLabels;
  pegLabels: { label: string; title: string };
  analyseLabels: AnalyseLabels;
}) {
  return (
    <ul className="border-line divide-line divide-y overflow-hidden rounded-xl border">
      {rows.map((entry) => (
        <li
          key={entry.symbol}
          className="bg-surface hover:bg-surface-hover flex items-center justify-between gap-2 pr-2 transition"
        >
          {/* Only the row body navigates: a remove button inside the link would
              open the stock page on its way to removing. */}
          <Link
            href={`/stock/${encodeURIComponent(entry.symbol)}`}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {entry.symbol}
                <span className="text-ink-subtle ml-2 font-normal">
                  {entry.name ?? ''}
                </span>
              </p>
              <p className="text-ink-subtle mt-0.5 text-xs">
                {entry.signal
                  ? labels.conditionsMet(
                      entry.signal.conditions_met,
                      entry.signal.conditions_applicable,
                    )
                  : labels.pending}
                {/* The one thing in the way, when there is exactly one. Two
                    stocks on the same count can wear different badges, and the
                    count alone cannot say why. */}
                {labels.missingOne(entry) && (
                  <span className="text-ink-faint">
                    {' · '}
                    {labels.missingOne(entry)}
                  </span>
                )}
                {/* Passing on estimates rather than delivered earnings is the
                    one thing about the valuation test worth saying on a row. */}
                {entry.signal?.peg_basis === 'forward' && (
                  <>
                    {' '}
                    <PegBasisBadge basis="forward" {...pegLabels} compact />
                  </>
                )}
              </p>

              {/* Whether you have made your own call. Always printed, either
                  way: a row that only spoke up once reviewed would leave the
                  silence meaning both "not reviewed" and "does not say". */}
              <ReviewMark {...labels.review(entry)} />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {entry.signal ? (
                <>
                  {/* Was a nine-segment meter restating the count beside it. */}
                  <TrendCell trend={trends.get(entry.symbol) ?? null} labels={trendLabels} />
                  <StatusBadge status={entry.signal.status} />
                </>
              ) : (
                // Not analysed yet, and — until the nightly schedule exists —
                // not going to be. The row offers to do it rather than only
                // reporting that something else will.
                <AnalyseNow symbol={entry.symbol} labels={analyseLabels} compact />
              )}
            </div>
          </Link>

          <RemoveFromWatchlist symbol={entry.symbol} member labels={removeLabels} compact />
        </li>
      ))}
    </ul>
  );
}

/** Your own verdict on a row, or the absence of one. */
function ReviewMark({ text, done }: { text: string; done: boolean }) {
  return (
    <p
      className={`mt-0.5 text-xs ${
        done ? 'text-ink-subtle' : 'text-amber-700 dark:text-amber-500'
      }`}
    >
      <span aria-hidden="true" className="mr-1">
        {done ? '✓' : '○'}
      </span>
      {text}
    </p>
  );
}

