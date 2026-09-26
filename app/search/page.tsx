import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { AddToWatchlist } from '@/components/AddToWatchlist';
import { searchUniverse } from '@/lib/data/queries';
import { formatBillions } from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/config';

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

  const locale = (await getLocale()) as Lang;
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
        <p className="text-ink-subtle mt-1 max-w-prose text-sm">{t('intro')}</p>

        <form method="GET" action="/search" className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            autoFocus
            className="bg-surface border-line-strong min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
          >
            {t('submit')}
          </button>
        </form>

        {query.length > 0 && query.length < 2 && (
          <p className="text-ink-subtle mt-4 text-sm">{t('minLength')}</p>
        )}

        {query.length >= 2 && results.length === 0 && (
          <p className="border-line-strong text-ink-subtle mt-6 rounded-lg border border-dashed p-6 text-center text-sm">
            {t('noResults', { query })}
          </p>
        )}

        {results.length > 0 && (
          <ul className="border-line mt-6 divide-line divide-y overflow-hidden rounded-xl border">
            {results.map((row) => (
              <li
                key={row.symbol}
                className="bg-surface flex flex-wrap items-center justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {row.symbol}
                    <span className="text-ink-subtle ml-2 font-normal">
                      {row.name ?? ''}
                    </span>
                  </p>
                  <p className="text-ink-subtle mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                    <span>
                      {[row.exchange, row.country].filter(Boolean).join(' · ') || '—'}
                    </span>
                    {row.marketCapUsd != null ? (
                      // The real USD cap once we have written one back (A1c) —
                      // the size itself, not the band label. Still not a verdict:
                      // the ✓ belongs to the checklist.
                      <span className="text-ink-faint">
                        {formatBillions(row.marketCapUsd, 'USD', locale)}
                      </span>
                    ) : (
                      row.sizeLabel && (
                        // Falls back to the band label where we have not
                        // evaluated a real figure yet.
                        <span className="text-ink-faint">{t(`size.${row.sizeLabel}`)}</span>
                      )
                    )}
                    {row.analysed ? (
                      <Link
                        href={`/stock/${encodeURIComponent(row.symbol)}`}
                        className="underline underline-offset-2 hover:text-ink"
                      >
                        {t('open')}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">{t('notAnalysed')}</span>
                    )}
                  </p>
                  {row.alsoListedOn.length > 0 && (
                    <p className="text-ink-faint mt-0.5 truncate text-xs">
                      {t('alsoListedOn', { venues: row.alsoListedOn.slice(0, 3).join(', ') })}
                    </p>
                  )}
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

        <p className="text-ink-faint mt-8 text-xs">
          <Link href="/" className="underline underline-offset-2">
            {tNav('watchlist')}
          </Link>
        </p>
      </main>
    </>
  );
}
