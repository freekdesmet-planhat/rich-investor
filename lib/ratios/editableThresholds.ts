/**
 * Which thresholds are yours to change, and which are the book's.
 *
 * Twenty metric cards label their target "app default", which implies a setting
 * that has never existed. The fix is not to change the label: some of those
 * numbers genuinely are the app's own choices, and they should be yours.
 *
 * But only those. Fourteen of the nineteen thresholds come from the book — the
 * P/E ceiling of 30, the PEG bands, the 50% decline, the $10bn floor — and the
 * whole point of this app is that it applies that framework rather than one of
 * its own. Making those editable would turn a book into a spreadsheet. So the
 * editable set is derived from the `source` field rather than listed here: a
 * threshold is yours exactly when the app admits it made the number up, and if
 * one is ever reclassified this follows without anyone remembering to.
 */
import { DEFAULT_THRESHOLDS, type Thresholds } from './thresholds';

export type EditableKey = keyof Thresholds;

/** The thresholds the app chose for itself, and therefore may be overridden. */
export const EDITABLE_KEYS: EditableKey[] = (
  Object.entries(DEFAULT_THRESHOLDS) as Array<[EditableKey, { source: string }]>
)
  .filter(([, threshold]) => threshold.source === 'app_default')
  .map(([key]) => key);

export const isEditableKey = (key: string): key is EditableKey =>
  (EDITABLE_KEYS as string[]).includes(key);

/** The fields of one threshold, with the value the app ships. */
export function defaultFieldsFor(key: EditableKey): Record<string, number> {
  const value = DEFAULT_THRESHOLDS[key].value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => typeof v === 'number'),
  ) as Record<string, number>;
}

export interface SanitisedOverrides {
  /** Safe to hand to `mergeThresholds`. */
  overrides: Record<string, Record<string, number>>;
  /** What was dropped and why, so a form can say rather than silently ignore. */
  rejected: Array<{ key: string; field?: string; reason: 'not_editable' | 'unknown_field' | 'not_a_number' }>;
}

/**
 * Filters submitted overrides down to what may actually be applied.
 *
 * Everything is checked rather than trusted: these values come from a form and
 * end up deciding whether a stock is buy-worthy. A field the default does not
 * have is dropped, because merging it would put a key into the thresholds that
 * no rule reads — a setting that appears to do something and does nothing.
 */
export function sanitiseOverrides(raw: unknown): SanitisedOverrides {
  const overrides: Record<string, Record<string, number>> = {};
  const rejected: SanitisedOverrides['rejected'] = [];

  if (raw == null || typeof raw !== 'object') return { overrides, rejected };

  for (const [key, group] of Object.entries(raw as Record<string, unknown>)) {
    if (!isEditableKey(key)) {
      rejected.push({ key, reason: 'not_editable' });
      continue;
    }
    if (group == null || typeof group !== 'object') continue;

    const defaults = defaultFieldsFor(key);
    const cleaned: Record<string, number> = {};

    for (const [field, value] of Object.entries(group as Record<string, unknown>)) {
      if (!(field in defaults)) {
        rejected.push({ key, field, reason: 'unknown_field' });
        continue;
      }
      const numeric = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
      if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric <= 0) {
        rejected.push({ key, field, reason: 'not_a_number' });
        continue;
      }
      cleaned[field] = numeric;
    }

    if (Object.keys(cleaned).length > 0) overrides[key] = cleaned;
  }

  return { overrides, rejected };
}

/** Whether a stored override actually differs from what the app ships. */
export function isOverridden(
  key: EditableKey,
  overrides: Record<string, Record<string, number>> | null | undefined,
): boolean {
  const group = overrides?.[key];
  if (!group) return false;

  const defaults = defaultFieldsFor(key);
  return Object.entries(group).some(([field, value]) => defaults[field] !== value);
}

/**
 * Which threshold decides a given ratio card.
 *
 * Only the editable ones need an entry: the card asks "is my target something
 * the reader chose?", and for the book's thresholds the answer is always no.
 */
export const RATIO_THRESHOLD: Record<string, EditableKey> = {
  ev_ebit: 'evEbit',
  p_fcf: 'pFcf',
  revenue_growth: 'revenueGrowth',
  debt: 'debt',
};

/**
 * The target a card should print once the household has changed it.
 *
 * The label on a card comes from `docs/ratios.<lang>.md`, which is static
 * prose: it will happily say "≤ 20" while the threshold deciding the colour is
 * 15. Saying "(your setting)" beside a number that is not your setting is worse
 * than the "app default" label this replaced, so an overridden card builds its
 * target from the value in force.
 *
 * Null when nothing was overridden, which leaves the documented text alone.
 */
export function overriddenTargetLabel(
  ratioKey: string,
  overrides: Record<string, Record<string, number>> | null | undefined,
  format: (value: number) => string,
): string | null {
  const key = RATIO_THRESHOLD[ratioKey];
  if (!key || !isOverridden(key, overrides)) return null;

  const merged = { ...defaultFieldsFor(key), ...(overrides?.[key] ?? {}) };

  switch (key) {
    case 'evEbit':
    case 'pFcf':
      return `\u2264 ${format(merged.green)}`;
    case 'revenueGrowth':
      // Stored as a fraction and read as a percentage, like the card above it.
      return `\u2265 ${format(merged.green * 100)}%`;
    case 'debt':
      return `\u2264 ${format(merged.netDebtEbitdaGreen)}`;
    default:
      return null;
  }
}
