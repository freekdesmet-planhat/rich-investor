import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { SuggestionDecision, type DecisionLabels } from '@/components/SuggestionDecision';
import { createClient } from '@/lib/supabase/server';
import { getRecentDismissal, getScreeningProvenance } from '@/lib/data/queries';
import { UndoDismissal } from '@/components/UndoDismissal';
import {
  dismissalDaysLeft,
  isSuggestionSort,
  isSuggestionTab,
  sortSuggestions,
  suggestionHref,
  suggestionsFor,
  SUGGESTION_SORTS,
  SUGGESTION_TABS,
  tabCounts,
  type SuggestionSort,
  type SuggestionTab,
} from '@/lib/data/suggestionsView';
import { DISMISS_DAYS } from '@/lib/pipeline/scan';
import type { Lang } from '@/lib/i18n/config';

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

export default async function SuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const tab: SuggestionTab = isSuggestionTab(params.tab) ? params.tab : 'pending';
  const sort: SuggestionSort = isSuggestionSort(params.sort) ? params.sort : 'status';

  const locale = (await getLocale()) as Lang;
  const [t, tSector] = await Promise.all([
    getTranslations('suggestions'),
    getTranslations('sector'),
  ]);

  const supabase = await createClient();
  const [{ data }, provenance, justDismissed] = await Promise.all([
    supabase
      .from('suggestions')
      .select('symbol,name,focus_sector,state,status,why_en,why_nl,suggested_at,rejected_until')
      .order('suggested_at', { ascending: false })
      .returns<SuggestionRow[]>(),
    getScreeningProvenance(),
    getRecentDismissal(),
  ]);

  const rows = data ?? [];
  const counts = tabCounts(rows);
  const visible = sortSuggestions(suggestionsFor(rows, tab), sort);

  const decisionLabels: DecisionLabels = {
    accept: t('accept'),
    accepting: t('accepting'),
    dismiss: t('dismiss'),
    dismissing: t('dismissing'),
    // `.raw` because {symbol} and {days} are filled in on the client, where the
    // card is known; formatting here without the values raises FORMATTING_ERROR.
    accepted: t.raw('acceptedToast') as string,
    dismissed: t.raw('dismissedToast') as string,
    restored: t.raw('restoredToast') as string,
    undo: t('undo'),
    restore: t('restore'),
    restoring: t('restoring'),
    openAnalysis: t('openAnalysis'),
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition ${
      active
        ? 'border-accent bg-accent font-medium text-accent-ink'
        : 'border-line-strong text-ink-muted hover:bg-surface-hover'
    }`;

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>

        {/* What was looked at to produce these. Four out of a dozen and four out
            of six thousand are different claims, and the page used to make
            neither — it showed the cards and nothing else. */}
        <p className="text-ink-subtle mb-4 text-sm">
          {provenance.screened != null
            ? t('provenance', { screened: provenance.screened })
            : t('pending')}
          {provenance.lastSuggestedAt && (
            <span className="ml-1">
              {t('lastRaised', { date: provenance.lastSuggestedAt })}
            </span>
          )}
        </p>

        {/* The undo, rendered from what the database says was just decided
            rather than from state inside the card — the card is gone by the
            time this page re-renders. */}
        {justDismissed && (
          <UndoDismissal
            symbol={justDismissed.symbol}
            labels={{
              dismissed: t.raw('dismissedToast') as string,
              days: String(DISMISS_DAYS),
              undo: t('undo'),
              restoring: t('restoring'),
              restored: t.raw('restoredToast') as string,
            }}
          />
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {SUGGESTION_TABS.map((value) => (
            <Link
              key={value}
              href={suggestionHref({ tab, sort }, { tab: value })}
              aria-current={tab === value ? 'true' : undefined}
              className={chip(tab === value)}
            >
              {t(`tab.${value}`)}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[value]}</span>
            </Link>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-subtle">{t('sortBy')}:</span>
          {SUGGESTION_SORTS.map((value) => (
            <Link
              key={value}
              href={suggestionHref({ tab, sort }, { sort: value })}
              aria-current={sort === value ? 'true' : undefined}
              className={
                sort === value
                  ? 'font-medium text-ink underline underline-offset-4'
                  : 'text-ink-subtle underline-offset-4 hover:text-ink hover:underline'
              }
            >
              {t(`sort.${value}`)}
            </Link>
          ))}
        </div>

        {visible.length === 0 && (
          <p className="border-line-strong text-ink-subtle rounded-lg border border-dashed p-6 text-center text-sm">
            {t(`empty.${tab}`)}
          </p>
        )}

        <ul className="space-y-3">
          {visible.map((row) => {
            const daysLeft = dismissalDaysLeft(row.rejected_until);
            return (
              <li
                key={row.symbol}
                className="bg-surface border-line rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {/* Underlined and coloured, because this heading is the only
                        route to the analysis and it used to be styled exactly
                        like the plain text beside it — findable by reading the
                        DOM, which is not a navigation model. */}
                    <Link
                      href={`/stock/${encodeURIComponent(row.symbol)}`}
                      className="text-ink font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                    >
                      {row.symbol}
                      <span className="text-ink-subtle ml-2 font-normal">
                        {row.name}
                      </span>
                    </Link>
                    <p className="text-ink-subtle mt-0.5 text-xs">
                      {tSector(row.focus_sector)} · {t('suggestedOn', { date: row.suggested_at })}
                      {daysLeft != null && (
                        <span className="ml-1 text-amber-700 dark:text-amber-500">
                          · {t('dismissedDaysLeft', { days: daysLeft })}
                        </span>
                      )}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                {/* The same generated reasoning the detail page and email use. */}
                <p className="text-ink-muted mt-3 text-sm leading-relaxed">
                  {locale === 'nl' ? row.why_nl : row.why_en}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {row.state === 'accepted' ? (
                    <span className="text-sm text-emerald-700 dark:text-emerald-400">
                      {t('onWatchlist')}
                    </span>
                  ) : (
                    <SuggestionDecision
                      symbol={row.symbol}
                      dismissed={row.state === 'rejected'}
                      labels={decisionLabels}
                    />
                  )}

                  {/* An explicit way through to the numbers, beside the two
                      decisions, so reading first is as available as deciding. */}
                  <Link
                    href={`/stock/${encodeURIComponent(row.symbol)}`}
                    className="text-ink-muted text-sm underline underline-offset-4 hover:text-ink"
                  >
                    {t('openAnalysis')}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
