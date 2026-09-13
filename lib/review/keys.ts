/**
 * Catalyst and sell-signal keys from the book (chapters 9 and 10).
 *
 * Kept out of the server-action file: a `'use server'` module may only export
 * async functions, so exporting these constants from it broke the build.
 * Labels and explanations live in docs/ratios.<lang>.md under the `catalyst:`
 * and `sell_signal:` namespaces — these are only the identifiers.
 */
export const CATALYST_KEYS = [
  'management_reaffirms_targets',
  'management_buying_shares',
  'buybacks',
  'dividend_increase',
  'sector_still_growing',
  'founder_or_long_tenured_ceo',
  'problem_confined_to_one_cycle',
] as const;

export const SELL_SIGNAL_KEYS = [
  'deteriorating_performance',
  'large_acquisition_high_premium',
  'involuntary_cfo_departure',
  'declining_solvency',
  'unusual_insider_selling',
  'no_visible_future_growth',
] as const;

export const ASSESSMENTS = ['temporary', 'structural', 'not_assessed'] as const;

export type Assessment = (typeof ASSESSMENTS)[number];
