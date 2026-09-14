/**
 * Putting two or three names beside each other.
 *
 * Seven of the twenty-seven sit at 7 of 9. The count is the same, the badge is
 * often the same, and which conditions they are missing is not — so choosing
 * between them meant opening each in its own tab and holding nine booleans in
 * your head. The filters added in an earlier batch make that cluster easy to
 * find, which only sharpened the problem of what to do once you have found it.
 *
 * Everything needed is already in the stored checklists: each condition carries
 * whether it applied, whether it passed, and the value it was judged on. So
 * this is a reading of data the nightly job already writes, and it is pure, so
 * "which rows actually differ" can be tested without a database.
 */

export const MAX_COMPARED = 3;

export interface ComparableCondition {
  key: string;
  applicable: boolean;
  passed: boolean;
  value: number | null;
  target: string;
}

export interface ComparableEntry {
  symbol: string;
  name: string | null;
  signal: {
    status: 'buy_worthy' | 'almost' | 'watching';
    conditions_met: number;
    conditions_applicable: number;
    lynch_category?: string;
    checklist: ComparableCondition[];
  } | null;
}

/**
 * The symbols asked for, in the order given, filtered to ones actually on the
 * watchlist and capped.
 *
 * A URL is a thing people edit and share, so an unknown ticker is dropped
 * rather than rendered as an empty column, and duplicates collapse.
 */
export function parseCompared(
  requested: string[],
  allowed: Iterable<string>,
  max = MAX_COMPARED,
): string[] {
  const known = new Set(allowed);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of requested) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol) || !known.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
    if (out.length === max) break;
  }
  return out;
}

export interface CompareCell {
  symbol: string;
  /** Null when this ticker has no evaluation at all. */
  condition: ComparableCondition | null;
}

export interface CompareRow {
  key: string;
  cells: CompareCell[];
  /**
   * True when the compared names do not all agree.
   *
   * The reason to put them side by side: a row where everyone passes tells you
   * nothing about which to buy. Conditions that do not apply to a ticker are
   * left out of the comparison — a bank having no EV/EBIT is not a
   * disagreement about the company.
   */
  differs: boolean;
}

/**
 * One row per condition, in the order the checklist itself uses.
 *
 * Order comes from the first evaluated ticker rather than a hardcoded list, so
 * the table follows the engine if the checklist ever changes.
 */
export function compareRows(entries: ComparableEntry[]): CompareRow[] {
  const order: string[] = [];
  for (const entry of entries) {
    for (const condition of entry.signal?.checklist ?? []) {
      if (!order.includes(condition.key)) order.push(condition.key);
    }
  }

  return order.map((key) => {
    const cells: CompareCell[] = entries.map((entry) => ({
      symbol: entry.symbol,
      condition: entry.signal?.checklist.find((c) => c.key === key) ?? null,
    }));

    const verdicts = cells
      .map((cell) => cell.condition)
      .filter((c): c is ComparableCondition => c != null && c.applicable)
      .map((c) => c.passed);

    return {
      key,
      cells,
      differs: verdicts.length > 1 && verdicts.some((v) => v !== verdicts[0]),
    };
  });
}

/** Rows where the names disagree, which is the whole reason to compare them. */
export function differingRows(rows: CompareRow[]): CompareRow[] {
  return rows.filter((row) => row.differs);
}

/**
 * Adds or removes a symbol from a comparison, for the link on each row.
 *
 * Toggling rather than only adding, so the same control takes a name out of the
 * comparison again; capped, so a fourth choice does not silently do nothing.
 */
export function toggleCompared(current: string[], symbol: string, max = MAX_COMPARED): string[] {
  const upper = symbol.toUpperCase();
  if (current.includes(upper)) return current.filter((s) => s !== upper);
  if (current.length >= max) return current;
  return [...current, upper];
}

/** The comparison URL for a set of symbols, or the bare page when empty. */
export function compareHref(symbols: string[]): string {
  if (symbols.length === 0) return '/compare';
  const params = new URLSearchParams();
  for (const symbol of symbols) params.append('symbols', symbol);
  return `/compare?${params.toString()}`;
}
