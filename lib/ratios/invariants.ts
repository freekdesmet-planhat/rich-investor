/**
 * Standing invariants, checked for every company on every pipeline run.
 *
 * These are arithmetic truths, not heuristics: if one breaks, a number is wrong
 * and any signal built on it is wrong too. They exist because two bugs shipped
 * numbers that looked plausible enough to pass a manual read — an adjusted ROA
 * of 261%, and a forward growth rate inflated by an unconverted exchange rate.
 * A violation is loud and recorded rather than left to be spotted by eye.
 */
import type { RatioContext, RatioKey, RatioResult } from './engine';

export interface InvariantViolation {
  symbol: string;
  rule: string;
  message: string;
  values: Record<string, unknown>;
}

/** Ratios whose value is a price divided by a figure from the statements. */
const PRICE_BASED: RatioKey[] = ['pe', 'ev_ebit', 'p_fcf', 'p_s', 'p_b', 'rnd_adjusted_pe'];

export function checkInvariants(
  ctx: RatioContext,
  ratios: Record<RatioKey, RatioResult>,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const add = (rule: string, message: string, values: Record<string, unknown>) =>
    violations.push({ symbol: ctx.symbol, rule, message, values });

  const roe = ratios.roe.value;
  const roa = ratios.roa.value;

  // ---------------------------------------------------------------------
  // Assets >= equity, therefore ROA <= ROE, for any company whose
  // liabilities are non-negative. True of raw and adjusted ROA alike, so an
  // adjustment that breaks it has removed more assets than the balance sheet
  // contains.
  // ---------------------------------------------------------------------
  if (roe != null && roa != null && roe > 0 && roa > roe * 1.001) {
    const detail = ratios.roa.detail as { isAdjusted?: boolean; rawValue?: number | null };
    add(
      'roa_not_above_roe',
      `ROA (${(roa * 100).toFixed(1)}%) exceeds ROE (${(roe * 100).toFixed(1)}%), which is ` +
        `arithmetically impossible when assets are at least equity`,
      {
        roa,
        roe,
        isAdjusted: detail.isAdjusted ?? false,
        rawRoa: detail.rawValue ?? null,
      },
    );
  }

  // A return of more than 100% on assets is not impossible, but it is rare
  // enough that it is nearly always an adjustment gone wrong.
  if (roa != null && roa > 1) {
    add('roa_implausible', `ROA of ${(roa * 100).toFixed(0)}% is implausibly high`, { roa });
  }

  // ---------------------------------------------------------------------
  // Currency: a price-based ratio must never combine two currencies. When the
  // trading and filing currencies differ, a rate must have been applied; if
  // none was available the ratio must be withheld, not computed.
  // ---------------------------------------------------------------------
  const mismatched = ctx.quoteCurrency !== ctx.filingCurrency;
  if (mismatched && ctx.fxApplied == null) {
    for (const key of PRICE_BASED) {
      const ratio = ratios[key];
      if (ratio.value != null) {
        add(
          'currency_unconverted',
          `${key} was computed while ${ctx.quoteCurrency} price and ` +
            `${ctx.filingCurrency} statements could not be reconciled`,
          { key, quoteCurrency: ctx.quoteCurrency, filingCurrency: ctx.filingCurrency },
        );
      }
    }
  }

  // The forward PEG divides a consensus EPS, quoted in the trading currency, by
  // a trailing EPS taken from the filings. Its growth figure must therefore have
  // been converted whenever the two currencies differ.
  const pegDetail = ratios.peg.detail as {
    forwardGrowth?: number | null;
    nextYearEps?: number | null;
    nextYearEpsInFilingCurrency?: number | null;
  };
  if (
    mismatched &&
    pegDetail.forwardGrowth != null &&
    pegDetail.nextYearEps != null &&
    pegDetail.nextYearEpsInFilingCurrency == null
  ) {
    add(
      'forward_eps_unconverted',
      'forward growth was derived from a consensus EPS that was never converted ' +
        'into the filing currency',
      {
        nextYearEps: pegDetail.nextYearEps,
        quoteCurrency: ctx.quoteCurrency,
        filingCurrency: ctx.filingCurrency,
      },
    );
  }

  // ---------------------------------------------------------------------
  // A percentage reported as a fraction should stay in a sane range.
  // ---------------------------------------------------------------------
  for (const [key, ratio] of Object.entries(ratios) as Array<[RatioKey, RatioResult]>) {
    if (ratio.unit === 'percent' && ratio.value != null && Math.abs(ratio.value) > 50) {
      add('percent_out_of_range', `${key} is ${(ratio.value * 100).toFixed(0)}%`, {
        key,
        value: ratio.value,
      });
    }
  }

  return violations;
}

/** Formats violations for a log line. */
export function formatViolations(violations: InvariantViolation[]): string {
  return violations
    .map((v) => `  ! ${v.symbol} ${v.rule}: ${v.message}`)
    .join('\n');
}
