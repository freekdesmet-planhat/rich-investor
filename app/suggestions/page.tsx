import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { createClient } from '@/lib/supabase/server';
import { DISMISS_DAYS } from '@/lib/pipeline/scan';
import type { Lang } from '@/lib/i18n/config';
import { acceptSuggestion, dismissSuggestion } from './actions';

export const dynamic = 'force-dynamic';

interface SuggestionRow {
  symbol: string;
  name: string | null;
  focus_sector: string;
  state: 'pending' | 'accepted' | 'rejected';
  status: 'buy_worthy' | 'almost' | 'watching';
  why_en: string | null;
  why_nl: string | null;
  suggested_at: string;
  rejected_until: string | null;
}

export default async function SuggestionsPage() {
  const locale = (await getLocale()) as Lang;
  const [t, tSector] = await Promise.all([
    getTranslations('suggestions'),
    getTranslations('sector'),
  ]);

  const supabase = await createClient();
  const { data } = await supabase
    .from('suggestions')
    .select('symbol,name,focus_sector,state,status,why_en,why_nl,suggested_at,rejected_until')
    .order('suggested_at', { ascending: false })
    .returns<SuggestionRow[]>();

  const rows = data ?? [];
  const pending = rows.filter((r) => r.state === 'pending');
  const decided = rows.filter((r) => r.state !== 'pending').slice(0, 10);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">{t('pending')}</p>

        {pending.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t('empty')}
          </p>
        )}

        <ul className="space-y-3">
          {pending.map((row) => (
            <li
              key={row.symbol}
              className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/stock/${encodeURIComponent(row.symbol)}`}
                    className="font-medium hover:underline"
                  >
                    {row.symbol}
                    <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                      {row.name}
                    </span>
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {tSector(row.focus_sector)} · {t('suggestedOn', { date: row.suggested_at })}
                  </p>
                </div>
                <StatusBadge status={row.status} />
              </div>

              {/* The same generated reasoning the detail page and email use. */}
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {locale === 'nl' ? row.why_nl : row.why_en}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={acceptSuggestion}>
                  <input type="hidden" name="symbol" value={row.symbol} />
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                  >
                    {t('accept')}
                  </button>
                </form>
                <form action={dismissSuggestion}>
                  <input type="hidden" name="symbol" value={row.symbol} />
                  <button
                    type="submit"
                    title={t('dismissedFor', { days: DISMISS_DAYS })}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {t('dismiss')}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>

        {decided.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-sm font-medium text-slate-500 dark:text-slate-400">
              {t('recentlyDecided')}
            </h2>
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
              {decided.map((row) => (
                <li
                  key={row.symbol}
                  className="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-slate-900"
                >
                  <Link href={`/stock/${encodeURIComponent(row.symbol)}`} className="hover:underline">
                    {row.symbol}
                  </Link>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {row.state === 'accepted'
                      ? t('accepted')
                      : `${t('rejected')}${row.rejected_until ? ` · ${row.rejected_until}` : ''}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
