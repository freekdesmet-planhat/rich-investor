import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MarketContextDashboard } from '@/components/MarketContextDashboard';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { getCompanyNames, getLatestSignals, type SignalRow } from '@/lib/data/queries';
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

function groupBySector(signals: SignalRow[]): Map<FocusSector, SignalRow[]> {
  const groups = new Map<FocusSector, SignalRow[]>();
  for (const sector of SECTOR_ORDER) groups.set(sector, []);
  for (const signal of signals) {
    const bucket = groups.get(signal.focus_sector) ?? groups.get('outside_focus')!;
    bucket.push(signal);
  }
  for (const [sector, rows] of groups) if (rows.length === 0) groups.delete(sector);
  return groups;
}

export default async function WatchlistPage() {
  const [t, tStatus, tSector] = await Promise.all([
    getTranslations('app'),
    getTranslations('status'),
    getTranslations('sector'),
  ]);

  const signals = await getLatestSignals();
  const names = await getCompanyNames(signals.map((s) => s.symbol));
  const groups = groupBySector(signals);

  const buyWorthy = signals.filter((s) => s.status === 'buy_worthy').length;
  const almost = signals.filter((s) => s.status === 'almost').length;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Market weather first: the book reads it as context for the hunt,
            not as a signal, so it sits above the watchlist rather than in it. */}
        <MarketContextDashboard />

        <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold">{(await getTranslations('nav'))('watchlist')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {signals.length} · {buyWorthy} {tStatus('buy_worthy').toLowerCase()} · {almost}{' '}
            {tStatus('almost').toLowerCase()}
          </p>
        </div>

        {signals.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t('tagline')}
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
                {rows.map((signal) => (
                  <li key={signal.symbol}>
                    <Link
                      href={`/stock/${encodeURIComponent(signal.symbol)}`}
                      className="flex items-center justify-between gap-3 bg-white px-3 py-3 transition hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {signal.symbol}
                          <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                            {names.get(signal.symbol) ?? ''}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {tStatus('conditionsMet', {
                            met: signal.conditions_met,
                            total: signal.conditions_applicable,
                          })}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <ConditionMeter
                          met={signal.conditions_met}
                          total={signal.conditions_applicable}
                        />
                        <StatusBadge status={signal.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          {signals[0] ? (await getTranslations('data'))('asOf', { date: signals[0].as_of }) : ''}
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
