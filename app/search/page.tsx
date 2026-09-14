import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { AddToWatchlist } from '@/components/AddToWatchlist';
import { searchUniverse } from '@/lib/data/queries';

export const dynamic = 'force-dynamic';

/**
 * Ticker search.
 *
 * A plain GET form rather than a live-updating box: the query lives in the URL,
 * so a search is shareable and survives a reload, and it works before the
 * client bundle has loaded. Each keystroke would otherwise be a query against
 * 102,285 rows.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const [t, tNav, tAnalyse] = await Promise.all([
    getTranslations('search'),
    getTranslations('nav'),
    getTranslations('analyse'),
  ]);
  const results = query.length >= 2 ? await searchUniverse(query) : [];

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500 dark:text-slate-400">{t('intro')}</p>

        <form method="GET" action="/search" className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            autoFocus
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
          />
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
          >
            {t('submit')}
          </button>
        </form>

        {query.length > 0 && query.length < 2 && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{t('minLength')}</p>
        )}

        {query.length >= 2 && results.length === 0 && (
          <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t('noResults', { query })}
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {results.map((row) => (
              <li
                key={row.symbol}
                className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 py-3 dark:bg-slate-900"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {row.symbol}
                    <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                      {row.name ?? ''}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      {[row.exchange, row.country].filter(Boolean).join(' · ') || '—'}
                    </span>
                    {row.analysed ? (
                      <Link
                        href={`/stock/${encodeURIComponent(row.symbol)}`}
                        className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
                      >
                        {t('open')}
                      </Link>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">{t('notAnalysed')}</span>
                    )}
                  </p>
                </div>

                <AddToWatchlist
                  symbol={row.symbol}
                  alreadyAdded={row.onWatchlist}
                  labels={{
                    add: t('add'),
                    adding: t('adding'),
                    onWatchlist: t('onWatchlist'),
                    unknownSymbol: t('unknownSymbol'),
                    failed: t('failed'),
                  }}
                  analyseLabels={{
                    analyse: tAnalyse('analyse'),
                    analysing: tAnalyse('analysing'),
                    done: tAnalyse.raw('done') as string,
                    failed: tAnalyse('failed'),
                    noData: tAnalyse('noData'),
                  }}
                />
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          <Link href="/" className="underline underline-offset-2">
            {tNav('watchlist')}
          </Link>
        </p>
      </main>
    </>
  );
}
