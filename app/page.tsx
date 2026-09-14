import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MarketContextDashboard } from '@/components/MarketContextDashboard';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { RemoveFromWatchlist } from '@/components/RemoveFromWatchlist';
import { getWatchlist, type WatchlistEntry } from '@/lib/data/queries';
import type { FocusSector } from '@/lib/sectors/mapping';

export const dynamic = 'force-dynamic';

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

export default async function WatchlistPage() {
  const [tStatus, tSector, tNav, tData, tWatchlist, tSearch] = await Promise.all([
    getTranslations('status'),
    getTranslations('sector'),
    getTranslations('nav'),
    getTranslations('data'),
    getTranslations('watchlist'),
    getTranslations('search'),
  ]);

  // Membership decides what is listed. The signal only decides what a row says:
  // a ticker added today has none until the nightly job runs, and it belongs on
  // the page from the moment it is added rather than the morning after.
  const entries = await getWatchlist();
  const groups = groupBySector(entries);

  const analysed = entries.filter((e) => e.signal);
  const buyWorthy = analysed.filter((e) => e.signal!.status === 'buy_worthy').length;
  const almost = analysed.filter((e) => e.signal!.status === 'almost').length;
  const asOf = analysed[0]?.signal?.as_of;

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

        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-xl font-semibold">{tNav('watchlist')}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {entries.length} · {buyWorthy} {tStatus('buy_worthy').toLowerCase()} · {almost}{' '}
              {tStatus('almost').toLowerCase()}
            </p>
          </div>
          <Link
            href="/search"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {tSearch('title')}
          </Link>
        </div>

        {entries.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {tWatchlist('empty')}
          </p>
        )}

        <div className="space-y-8">
          {[...groups].map(([sector, rows]) => (
            <section key={sector}>
              <h2 className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                {tSector(sector)}
                {sector === 'outside_focus' && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    !
                  </span>
                )}
              </h2>

              <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {rows.map((entry) => (
                  <li
                    key={entry.symbol}
                    className="flex items-center justify-between gap-2 bg-white pr-2 transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    {/* Only the row body navigates: a remove button inside the
                        link would open the stock page on its way to removing. */}
                    <Link
                      href={`/stock/${encodeURIComponent(entry.symbol)}`}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {entry.symbol}
                          <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                            {entry.name ?? ''}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {entry.signal
                            ? tStatus('conditionsMet', {
                                met: entry.signal.conditions_met,
                                total: entry.signal.conditions_applicable,
                              })
                            : tWatchlist('pending')}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {entry.signal ? (
                          <>
                            <ConditionMeter
                              met={entry.signal.conditions_met}
                              total={entry.signal.conditions_applicable}
                            />
                            <StatusBadge status={entry.signal.status} />
                          </>
                        ) : (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {tWatchlist('notAnalysed')}
                          </span>
                        )}
                      </div>
                    </Link>

                    <RemoveFromWatchlist symbol={entry.symbol} labels={removeLabels} compact />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          {asOf ? tData('asOf', { date: asOf }) : ''}
        </p>
      </main>
    </>
  );
}

/** Compact bar showing how many applicable conditions passed. */
function ConditionMeter({ met, total }: { met: number; total: number }) {
  return (
    <span className="hidden items-center gap-0.5 sm:flex" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`block h-4 w-1 rounded-sm ${
            i < met ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'
          }`}
        />
      ))}
    </span>
  );
}
