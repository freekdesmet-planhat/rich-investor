/**
 * When a company next reports, and whether that is soon enough to say.
 *
 * The date itself has been fetched and stored on every snapshot since the
 * beginning — `quote.nextEarningsDate` — and has never been shown anywhere.
 * This is the reading of it, shared by the stock page and the daily digest so
 * the two cannot disagree about what "soon" means.
 *
 * The one piece of judgement here is that a date in the past is treated as no
 * date at all. The quote provider does not always roll the field forward after
 * a company reports: of thirty watchlist snapshots carrying a date, three were
 * behind us. Printing "reports 27 July" in September is worse than printing
 * nothing — it is a confident statement that happens to be false, and the
 * reader has no way to tell which of the two they are looking at.
 */

/** Inside this window, a watchlist name is worth flagging in the digest. */
export const EARNINGS_SOON_DAYS = 14;

export interface UpcomingEarnings {
  /** ISO date, always today or later. */
  date: string;
  /** Whole days from today. 0 means it reports today. */
  daysAway: number;
  /** Within EARNINGS_SOON_DAYS. */
  soon: boolean;
}

const startOfDay = (value: Date): number =>
  Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

/**
 * Reads a stored earnings date, or null when there is nothing worth saying.
 *
 * Null covers all three ways this goes wrong — absent, unparseable, or in the
 * past — because the caller's response to each is identical: show nothing.
 * Distinguishing them would only invite a UI that explains why it has no date,
 * which is noise on a page already dense with figures.
 */
export function upcomingEarnings(
  nextEarningsDate: string | null | undefined,
  today: Date = new Date(),
): UpcomingEarnings | null {
  if (!nextEarningsDate) return null;

  const parsed = new Date(nextEarningsDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const days = Math.round((startOfDay(parsed) - startOfDay(today)) / 86_400_000);
  if (days < 0) return null;

  return { date: nextEarningsDate.slice(0, 10), daysAway: days, soon: days <= EARNINGS_SOON_DAYS };
}

/**
 * The watchlist names reporting soon, nearest first.
 *
 * Sorted by date rather than by symbol or by verdict, because the question
 * this answers is "what is about to happen", and the answer is chronological.
 */
export function reportingSoon<T extends { symbol: string; nextEarningsDate?: string | null }>(
  entries: T[],
  today: Date = new Date(),
): Array<T & { earnings: UpcomingEarnings }> {
  return entries
    .flatMap((entry) => {
      const earnings = upcomingEarnings(entry.nextEarningsDate, today);
      return earnings?.soon ? [{ ...entry, earnings }] : [];
    })
    .sort((a, b) => a.earnings.daysAway - b.earnings.daysAway);
}
