/**
 * The two facts about a stock's figures, in plain words (audit 11).
 *
 * A bare "Updated 17h ago · As of 2026-09-25" answered neither question a reader
 * actually has: how old is the price, and how old are the fundamentals. It also
 * lied — the age was derived from the as-of date at midnight, so a stock
 * analysed seconds ago still read "17h ago". This builds three lines instead:
 * when it was last analysed (from the real timestamp), which day's close the
 * price is, and which annual report the fundamentals come from.
 *
 * Pure and clock-injectable: every date it prints is derived, so a test can pin
 * the wording without waiting for tomorrow.
 */
import { hoursSince, relativeAge } from './freshness';
import { exchangeName } from './exchangeNames';

export interface StockFreshnessLabels {
  /** "Updated {age}" — {age} is filled from the labels below. */
  updated: string;
  /** Shown instead of an age when the run is within the hour. */
  justAnalysed: string;
  justNow: string;
  hoursAgo: string;
  daysAgo: string;
  /** "Price: close of {date} ({exchange})". */
  priceClose: string;
  /** "Price: close of {date}" — no venue, when the exchange is unknown. */
  priceCloseNoExchange: string;
  /** "Financials: annual report {year}". */
  financials: string;
}

export interface StockFreshnessInput {
  /** signal_history.created_at — the instant the analysis ran. */
  createdAt: string | null | undefined;
  /** The newest date in price_history, i.e. the close the price is from. */
  priceCloseDate: string | null | undefined;
  /** The venue code (e.g. "AMS"), turned into a name for display. */
  exchangeCode: string | null | undefined;
  /** endDate of the newest annual statement, for the report's year. */
  fiscalYearEndDate: string | null | undefined;
  locale: string;
  now?: Date;
  labels: StockFreshnessLabels;
}

export interface StockFreshnessView {
  /** "Just analysed" | "Updated 8h ago", or null when there is no timestamp. */
  age: string | null;
  priceLine: string | null;
  financialsLine: string | null;
}

/** A calendar date (yyyy-mm-dd), read as UTC so the day never shifts. */
function formatCloseDate(date: string, locale: string): string | null {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  // en-GB for English: this is a European product, so the day-month order
  // ("Thu 24 Sep") reads right and matches the Dutch sibling — plain "en" would
  // print the US month-day order with a comma.
  const dateLocale = locale.startsWith('en') ? 'en-GB' : locale;
  return new Intl.DateTimeFormat(dateLocale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

export function buildStockFreshness({
  createdAt,
  priceCloseDate,
  exchangeCode,
  fiscalYearEndDate,
  locale,
  now = new Date(),
  labels,
}: StockFreshnessInput): StockFreshnessView {
  // Age from the real instant, not the as-of date. Within the hour it reads
  // "Just analysed" — the on-demand case the old label got wrong.
  const ageHours = hoursSince(createdAt, now);
  let age: string | null = null;
  if (ageHours != null) {
    age =
      ageHours < 1
        ? labels.justAnalysed
        : labels.updated.replace(
            '{age}',
            relativeAge(ageHours, {
              justNow: labels.justNow,
              hours: labels.hoursAgo,
              days: labels.daysAgo,
            }) ?? '',
          );
  }

  let priceLine: string | null = null;
  if (priceCloseDate) {
    const day = formatCloseDate(priceCloseDate, locale);
    if (day) {
      const venue = exchangeName(exchangeCode);
      priceLine = venue
        ? labels.priceClose.replace('{date}', day).replace('{exchange}', venue)
        : labels.priceCloseNoExchange.replace('{date}', day);
    }
  }

  let financialsLine: string | null = null;
  // The year is taken from the string, not a parsed Date, so a period ending
  // 2025-09-27 reads as the 2025 report regardless of the reader's time zone.
  const year = fiscalYearEndDate?.slice(0, 4);
  if (year && /^\d{4}$/.test(year)) {
    financialsLine = labels.financials.replace('{year}', year);
  }

  return { age, priceLine, financialsLine };
}
