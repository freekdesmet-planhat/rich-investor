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
import { formatConditionValue } from '@/lib/signal/conditionFormat';
import type { Lang } from '@/lib/i18n/locale';
import { SectionHeading } from '@/components/ui/Surface';

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
        <p className="text-ink-subtle mb-4 text-sm">{t('intro')}</p>

        {/* Picking is a list of links rather than a form: each one toggles its
            own ticker in the URL, so the choice is shareable, survives a
            reload, and needs no JavaScript. */}
        <section className="mb-6">
          <SectionHeading>{t('pick', { max: MAX_COMPARED })}</SectionHeading>
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
                      className="border-line inline-block cursor-not-allowed rounded-full border px-3 py-1.5 text-xs text-ink-faint"
                    >
                      {entry.symbol}
                    </span>
                  ) : (
                    <Link
                      href={compareHref(next)}
                      aria-pressed={selected}
                      className={`inline-block rounded-full border px-3 py-1.5 text-xs transition ${
                        selected
                          ? 'border-accent bg-accent font-medium text-accent-ink'
                          : 'border-line-strong text-ink-muted hover:bg-surface-hover'
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
          <p className="border-line-strong text-ink-subtle rounded-lg border border-dashed p-6 text-center text-sm">
            {t('chooseTwo')}
          </p>
        ) : (
          <>
            <p className="text-ink-muted mb-2 text-sm">
              {differing === 0 ? t('identical') : t('differing', { count: differing })}
            </p>

            {/* The table scrolls rather than shrinking: three columns of
                pass/fail plus a label do not fit a phone, and squeezing them
                would cost the labels that say what is being compared. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <thead>
                  <tr className="border-line border-b">
                    <th className="text-ink-subtle py-2 pr-3 text-left font-normal">
                      {t('condition')}
                    </th>
                    {entries.map((entry) => (
                      <th key={entry.symbol} className="px-3 py-2 text-left align-bottom">
                        <Link
                          href={`/stock/${encodeURIComponent(entry.symbol)}`}
                          className="font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                        >
                          {entry.symbol}
                        </Link>
                        <span className="mt-1 block">
                          {entry.signal && <StatusBadge status={entry.signal.status} />}
                        </span>
                        <span className="text-ink-subtle mt-1 block text-xs font-normal">
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
                      className={`border-b border-line ${
                        row.differs ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <th
                        scope="row"
                        className={`py-2 pr-3 text-left font-normal ${
                          row.differs
                            ? 'text-ink'
                            : 'text-ink-subtle'
                        }`}
                      >
                        {CONDITION_LABEL[row.key]?.[locale] ?? row.key}
                      </th>
                      {row.cells.map((cell) => (
                        <td key={cell.symbol} className="px-3 py-2">
                          {cell.condition == null ? (
                            <span className="text-ink-faint">—</span>
                          ) : !cell.condition.applicable ? (
                            <span className="text-ink-faint">
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
                              {/* Through the same formatters as every other
                                  surface: this printed a market cap as a
                                  twelve-digit integer and a 61% decline as
                                  -0,61, because it formatted all nine
                                  conditions as if they were plain numbers. */}
                              <span className="text-ink-muted tabular-nums">
                                {formatConditionValue(cell.condition.key, cell.condition.value, locale)}
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
