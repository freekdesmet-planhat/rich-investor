import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { CompareAdd } from '@/components/CompareAdd';
import { AnalyseNow } from '@/components/AnalyseNow';
import { getWatchlist, getSignal, getCompanyNames } from '@/lib/data/queries';
import {
  compareHref,
  compareRows,
  toggleCompared,
  MAX_COMPARED,
  type ComparableEntry,
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
  const [t, tStatus, tAnalyse] = await Promise.all([
    getTranslations('compare'),
    getTranslations('status'),
    getTranslations('analyse'),
  ]);

  // Any company can be compared now, not only watchlist names (round 2, item 6):
  // dedupe, cap, and keep the ones that exist in the universe.
  const chosen: string[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    chosen.push(symbol);
    if (chosen.length === MAX_COMPARED) break;
  }

  const names = await getCompanyNames(chosen);
  const known = chosen.filter((s) => names.has(s));
  const signals = await Promise.all(known.map((s) => getSignal(s)));

  const entries: ComparableEntry[] = known.map((symbol, i) => {
    const sig = signals[i];
    return {
      symbol,
      name: names.get(symbol) ?? null,
      signal: sig
        ? {
            status: sig.status,
            conditions_met: sig.conditions_met,
            conditions_applicable: sig.conditions_applicable,
            lynch_category: sig.lynch_category,
            checklist: sig.checklist.map((c) => ({
              key: c.key,
              applicable: c.applicable,
              passed: c.passed,
              value: c.value,
              target: c.target,
            })),
          }
        : null,
    };
  });

  // A chosen company with no evaluation yet is analysed on demand, then the page
  // refreshes into the table (item 5's flow, one per column).
  const pending = entries.filter((e) => e.signal == null);
  const ready = entries.filter((e) => e.signal != null);
  const rows = compareRows(ready);
  const differing = rows.filter((r) => r.differs).length;

  const watchlist = await getWatchlist();

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
        <p className="text-ink-subtle mb-4 text-sm">{t('intro')}</p>

        {/* Search adds any company; the chips are a quick pick from the watchlist. */}
        <section className="mb-6 space-y-3">
          <CompareAdd
            chosen={chosen}
            placeholder={t('searchPlaceholder')}
            full={chosen.length >= MAX_COMPARED}
            fullLabel={t('full', { max: MAX_COMPARED })}
          />
          <div>
            <SectionHeading>{t('pick', { max: MAX_COMPARED })}</SectionHeading>
            <ul className="flex flex-wrap gap-2">
              {watchlist.map((entry) => {
                const selected = chosen.includes(entry.symbol);
                const next = toggleCompared(chosen, entry.symbol);
                const full = !selected && chosen.length >= MAX_COMPARED;
                const chip = (
                  <>
                    <span className="font-medium">{entry.name ?? entry.symbol}</span>
                    <span className="ml-1.5 text-[11px] opacity-60">{entry.symbol}</span>
                  </>
                );
                return (
                  <li key={entry.symbol}>
                    {full ? (
                      <span
                        title={t('full', { max: MAX_COMPARED })}
                        className="border-line inline-block cursor-not-allowed rounded-full border px-3 py-1.5 text-xs text-ink-faint"
                      >
                        {chip}
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
                        {chip}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Analyse any picked company that has no evaluation yet. */}
        {pending.map((entry) => (
          <div
            key={entry.symbol}
            className="border-line bg-surface-sunken mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="text-ink-muted">
              <span className="font-medium text-ink">{entry.name ?? entry.symbol}</span>{' '}
              <span className="text-ink-subtle text-xs">{entry.symbol}</span> — {tAnalyse('firstRun')}
            </span>
            <AnalyseNow
              symbol={entry.symbol}
              auto
              compact
              labels={{
                analyse: tAnalyse('analyse'),
                analysing: tAnalyse('analysing'),
                done: tAnalyse.raw('done') as string,
                failed: tAnalyse('failed'),
                noData: tAnalyse('noData'),
              }}
            />
          </div>
        ))}

        {ready.length < 2 ? (
          <p className="border-line-strong text-ink-subtle rounded-lg border border-dashed p-6 text-center text-sm">
            {t('chooseTwo')}
          </p>
        ) : (
          <>
            <p className="text-ink-muted mb-2 text-sm">
              {differing === 0 ? t('identical') : t('differing', { count: differing })}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-sm">
                <thead>
                  <tr className="border-line border-b">
                    <th className="text-ink-subtle py-2 pr-3 text-left font-normal">
                      {t('condition')}
                    </th>
                    {ready.map((entry) => (
                      <th key={entry.symbol} className="px-3 py-2 text-left align-bottom">
                        <Link
                          href={`/stock/${encodeURIComponent(entry.symbol)}`}
                          className="block font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                        >
                          {entry.name ?? entry.symbol}
                        </Link>
                        <span className="text-ink-subtle mt-0.5 block text-xs font-normal tabular-nums">
                          {entry.symbol}
                        </span>
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
                      className={`border-b border-line ${
                        row.differs ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      <th
                        scope="row"
                        className={`py-2 pr-3 text-left font-normal ${
                          row.differs ? 'text-ink' : 'text-ink-subtle'
                        }`}
                      >
                        {CONDITION_LABEL[row.key]?.[locale] ?? row.key}
                      </th>
                      {row.cells.map((cell) => (
                        <td key={cell.symbol} className="px-3 py-2">
                          {cell.condition == null ? (
                            <span className="text-ink-faint">—</span>
                          ) : !cell.condition.applicable ? (
                            <span className="text-ink-faint">{t('notApplicable')}</span>
                          ) : (
                            <span
                              className={
                                cell.condition.passed
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : 'text-rose-700 dark:text-rose-300'
                              }
                            >
                              <span aria-hidden="true">{cell.condition.passed ? '✓' : '✗'}</span>{' '}
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
