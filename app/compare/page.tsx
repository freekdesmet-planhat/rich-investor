import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { getWatchlist } from '@/lib/data/queries';
import {
  compareHref,
  compareRows,
  parseCompared,
  toggleCompared,
  MAX_COMPARED,
} from '@/lib/data/compareView';
import { CONDITION_LABEL } from '@/lib/signal/explain';
import { formatNumber } from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/locale';

export const dynamic = 'force-dynamic';

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ symbols?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.symbols)
    ? params.symbols
    : params.symbols
      ? [params.symbols]
      : [];

  const locale = (await getLocale()) as Lang;
  const [t, tStatus] = await Promise.all([
    getTranslations('compare'),
    getTranslations('status'),
  ]);

  const watchlist = await getWatchlist();
  const chosen = parseCompared(
    requested,
    watchlist.map((e) => e.symbol),
  );
  const entries = chosen
    .map((symbol) => watchlist.find((e) => e.symbol === symbol)!)
    .filter(Boolean);

  const rows = compareRows(entries);
  const differing = rows.filter((r) => r.differs).length;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{t('intro')}</p>

        {/* Picking is a list of links rather than a form: each one toggles its
            own ticker in the URL, so the choice is shareable, survives a
            reload, and needs no JavaScript. */}
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            {t('pick', { max: MAX_COMPARED })}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {watchlist.map((entry) => {
              const selected = chosen.includes(entry.symbol);
              const next = toggleCompared(chosen, entry.symbol);
              const full = !selected && chosen.length >= MAX_COMPARED;

              return (
                <li key={entry.symbol}>
                  {full ? (
                    // A fourth choice would do nothing; saying so is better than
                    // a link that silently ignores the click.
                    <span
                      title={t('full', { max: MAX_COMPARED })}
                      className="inline-block cursor-not-allowed rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-300 dark:border-slate-800 dark:text-slate-600"
                    >
                      {entry.symbol}
                    </span>
                  ) : (
                    <Link
                      href={compareHref(next)}
                      aria-pressed={selected}
                      className={`inline-block rounded-full border px-3 py-1.5 text-xs transition ${
                        selected
                          ? 'border-slate-900 bg-slate-900 font-medium text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {entry.symbol}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {entries.length < 2 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t('chooseTwo')}
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
              {differing === 0 ? t('identical') : t('differing', { count: differing })}
            </p>

            {/* The table scrolls rather than shrinking: three columns of
                pass/fail plus a label do not fit a phone, and squeezing them
                would cost the labels that say what is being compared. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-3 text-left font-normal text-slate-500 dark:text-slate-400">
                      {t('condition')}
                    </th>
                    {entries.map((entry) => (
                      <th key={entry.symbol} className="px-3 py-2 text-left align-bottom">
                        <Link
                          href={`/stock/${encodeURIComponent(entry.symbol)}`}
                          className="font-medium underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900 dark:decoration-slate-600"
                        >
                          {entry.symbol}
                        </Link>
                        <span className="mt-1 block">
                          {entry.signal && <StatusBadge status={entry.signal.status} />}
                        </span>
                        <span className="mt-1 block text-xs font-normal text-slate-500 dark:text-slate-400">
                          {entry.signal
                            ? tStatus('conditionsMet', {
                                met: entry.signal.conditions_met,
                                total: entry.signal.conditions_applicable,
                              })
                            : '—'}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      // The rows they disagree on are the reason to be here, so
                      // they are the ones that stand out; the rest is context.
                      className={`border-b border-slate-100 dark:border-slate-800/60 ${
                        row.differs ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <th
                        scope="row"
                        className={`py-2 pr-3 text-left font-normal ${
                          row.differs
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {CONDITION_LABEL[row.key]?.[locale] ?? row.key}
                      </th>
                      {row.cells.map((cell) => (
                        <td key={cell.symbol} className="px-3 py-2">
                          {cell.condition == null ? (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          ) : !cell.condition.applicable ? (
                            <span className="text-slate-400 dark:text-slate-500">
                              {t('notApplicable')}
                            </span>
                          ) : (
                            <span
                              className={
                                cell.condition.passed
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : 'text-rose-700 dark:text-rose-300'
                              }
                            >
                              <span aria-hidden="true">{cell.condition.passed ? '✓' : '✗'}</span>{' '}
                              <span className="tabular-nums text-slate-600 dark:text-slate-300">
                                {cell.condition.value == null
                                  ? ''
                                  : formatNumber(cell.condition.value, locale)}
                              </span>
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}
