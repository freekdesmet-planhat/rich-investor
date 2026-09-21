/**
 * Whether reported earnings look like the cash they claim to be.
 *
 * Informational only. The verdict logic is untouched: condition 8 already
 * asks whether free cash flow is positive and whether operating cash flow
 * covers at least 70% of net income, and that stays exactly as it is. These
 * are the questions it does not ask.
 *
 * Three of them, and they fail in different ways:
 *
 *   Cash conversion. Condition 8 compares operating cash flow to net income,
 *   which is before capital spending. A company can pass it comfortably and
 *   still turn very little of its reported profit into cash an owner could
 *   take out, because the capex line eats it. Comparing free cash flow per
 *   share against diluted EPS closes that gap — same denominator, same
 *   per-share basis, so the two numbers are directly comparable in a way
 *   the ratio in condition 8 is not.
 *
 *   Stock-based compensation. It is a real cost that never leaves the cash
 *   flow statement as cash, so it flatters operating cash flow and therefore
 *   condition 8 itself. A company paying 15% of revenue in stock looks
 *   better on that condition than one paying the same amount in salary.
 *
 *   Dilution. The share count is the denominator under every per-share
 *   figure on the page. Earnings can grow while earnings *per share* do not,
 *   and the checklist reads per-share figures throughout.
 *
 * The brief asked for stock comp "relative to peers". There is no peer data
 * in the app yet — that is item 10 — so this measures it against the
 * company's own revenue instead, which is how the figure is usually quoted
 * and needs no comparison set. Worth revisiting once peers exist.
 */

export interface AnnualFigures {
  /** Period end, ISO. */
  endDate: string;
  dilutedEps: number | null;
  dilutedShares: number | null;
  revenue: number | null;
  freeCashFlow: number | null;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  stockBasedCompensation: number | null;
}

export type QualityNoteKey = 'cashConversion' | 'stockComp' | 'dilution';

export interface QualityNote {
  key: QualityNoteKey;
  /** Higher is worse, and only used to order the notes. */
  severity: 1 | 2;
  /** The figures the copy interpolates. */
  values: Record<string, number>;
}

/**
 * Free cash flow, taking the reported figure when there is one.
 *
 * Providers disagree about the sign of capital expenditure — some report it
 * negative as an outflow, some positive as an amount spent — so when it has
 * to be derived, the magnitude is subtracted rather than the value added.
 * The ratio engine already learned this the hard way.
 */
export function freeCashFlowOf(year: AnnualFigures): number | null {
  if (year.freeCashFlow != null) return year.freeCashFlow;
  if (year.operatingCashFlow == null || year.capitalExpenditure == null) return null;
  return year.operatingCashFlow - Math.abs(year.capitalExpenditure);
}

/** Below this, reported profit is not turning into cash an owner could take. */
const CASH_CONVERSION_FLOOR = 0.7;
/** Stock comp above this share of revenue is worth a word. */
const STOCK_COMP_NOTABLE = 0.05;
const STOCK_COMP_HIGH = 0.1;
/** Annualised growth in the diluted share count worth a word. */
const DILUTION_NOTABLE = 0.02;

/**
 * The notes worth surfacing, worst first. Empty when nothing stands out,
 * which is the normal case and renders nothing at all.
 *
 * `years` is newest first, as the statements are stored.
 */
export function earningsQualityNotes(years: AnnualFigures[]): QualityNote[] {
  const notes: QualityNote[] = [];
  const latest = years[0];
  if (!latest) return notes;

  // --- cash conversion ----------------------------------------------------
  const fcf = freeCashFlowOf(latest);
  if (fcf != null && latest.dilutedShares && latest.dilutedShares > 0 && latest.dilutedEps) {
    const fcfPerShare = fcf / latest.dilutedShares;
    // Only meaningful against positive reported earnings. A loss is condition
    // 8's business, and dividing by it produces a ratio that reads backwards.
    if (latest.dilutedEps > 0) {
      const conversion = fcfPerShare / latest.dilutedEps;
      if (conversion < CASH_CONVERSION_FLOOR) {
        notes.push({
          key: 'cashConversion',
          severity: conversion < 0.4 ? 2 : 1,
          values: {
            percent: Math.round(conversion * 100),
            eps: latest.dilutedEps,
            fcfPerShare,
          },
        });
      }
    }
  }

  // --- stock-based compensation ------------------------------------------
  if (latest.stockBasedCompensation != null && latest.revenue && latest.revenue > 0) {
    const share = latest.stockBasedCompensation / latest.revenue;
    if (share >= STOCK_COMP_NOTABLE) {
      notes.push({
        key: 'stockComp',
        severity: share >= STOCK_COMP_HIGH ? 2 : 1,
        values: { percent: Math.round(share * 1000) / 10 },
      });
    }
  }

  // --- dilution -----------------------------------------------------------
  const withShares = years.filter((y) => y.dilutedShares != null && y.dilutedShares > 0);
  if (withShares.length >= 2) {
    const newest = withShares[0];
    const oldest = withShares[withShares.length - 1];
    const years_ = Math.max(
      1,
      Math.round(
        (new Date(newest.endDate).getTime() - new Date(oldest.endDate).getTime()) /
          (365.25 * 86_400_000),
      ),
    );
    const annual = (newest.dilutedShares! / oldest.dilutedShares!) ** (1 / years_) - 1;
    if (annual >= DILUTION_NOTABLE) {
      notes.push({
        key: 'dilution',
        severity: annual >= 0.04 ? 2 : 1,
        values: {
          percent: Math.round(annual * 1000) / 10,
          years: years_,
          total: Math.round((newest.dilutedShares! / oldest.dilutedShares! - 1) * 1000) / 10,
        },
      });
    }
  }

  return notes.sort((a, b) => b.severity - a.severity);
}
