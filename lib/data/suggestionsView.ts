/**
 * Reading the suggestion feed.
 *
 * The page showed pending suggestions and, under them, the ten most recent
 * decisions of any kind — so a dismissal disappeared into a list that mixed it
 * with acceptances and truncated at ten, and there was no way to ask "what have
 * I turned down?". Dismissing is also a single tap with no confirmation, which
 * on a phone is cheap to do by accident and, before this, permanent for ninety
 * days.
 *
 * None of that is a delete: a dismissal sets `state` and `rejected_until`, so
 * everything needed to show an archive and to undo is already stored. This
 * module is the reading of it — pure, so the tab counts and the ordering can be
 * tested without a database.
 */

export type SuggestionState = 'pending' | 'accepted' | 'rejected';
export type SuggestionTab = 'pending' | 'rejected' | 'accepted';
export type SuggestionSort = 'newest' | 'status' | 'symbol';

export const SUGGESTION_TABS: SuggestionTab[] = ['pending', 'rejected', 'accepted'];
export const SUGGESTION_SORTS: SuggestionSort[] = ['newest', 'status', 'symbol'];

export const isSuggestionTab = (value: unknown): value is SuggestionTab =>
  typeof value === 'string' && (SUGGESTION_TABS as string[]).includes(value);

export const isSuggestionSort = (value: unknown): value is SuggestionSort =>
  typeof value === 'string' && (SUGGESTION_SORTS as string[]).includes(value);

/** The shape this module needs; the query row satisfies it. */
export interface ViewableSuggestion {
  symbol: string;
  name: string | null;
  state: SuggestionState;
  status: 'buy_worthy' | 'almost' | 'watching';
  suggested_at: string;
  rejected_until: string | null;
}

export function suggestionsFor<T extends ViewableSuggestion>(rows: T[], tab: SuggestionTab): T[] {
  return rows.filter((row) => row.state === tab);
}

export function tabCounts<T extends ViewableSuggestion>(
  rows: T[],
): Record<SuggestionTab, number> {
  return {
    pending: rows.filter((r) => r.state === 'pending').length,
    rejected: rows.filter((r) => r.state === 'rejected').length,
    accepted: rows.filter((r) => r.state === 'accepted').length,
  };
}

const STATUS_RANK = { buy_worthy: 0, almost: 1, watching: 2 } as const;

/**
 * Orders a tab's rows.
 *
 * Newest first by default, because a suggestion is news. Sorting by status
 * exists because four cards all badged "almost there" tell you nothing about
 * which to read first, and the badge is the only thing that could.
 */
export function sortSuggestions<T extends ViewableSuggestion>(
  rows: T[],
  sort: SuggestionSort,
): T[] {
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'status':
        return STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.symbol.localeCompare(b.symbol);
      case 'symbol':
        return a.symbol.localeCompare(b.symbol);
      case 'newest':
      default:
        return b.suggested_at.localeCompare(a.suggested_at) || a.symbol.localeCompare(b.symbol);
    }
  });
}

/**
 * How long a dismissal still has to run, in whole days.
 *
 * Null once it has lapsed or was never set: at that point the scan may raise
 * the ticker again, and saying "0 days left" would suggest a state that no
 * longer exists.
 */
export function dismissalDaysLeft(
  rejectedUntil: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!rejectedUntil) return null;
  const until = Date.parse(`${rejectedUntil}T00:00:00Z`);
  if (Number.isNaN(until)) return null;

  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.round((until - today) / 86_400_000);
  return days > 0 ? days : null;
}

/** Builds the querystring for a tab or sort link, keeping the rest of the view. */
export function suggestionHref(
  current: { tab: SuggestionTab; sort: SuggestionSort },
  change: Partial<{ tab: SuggestionTab; sort: SuggestionSort }>,
): string {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  if (next.tab !== 'pending') params.set('tab', next.tab);
  if (next.sort !== 'newest') params.set('sort', next.sort);
  const qs = params.toString();
  return qs ? `/suggestions?${qs}` : '/suggestions';
}
