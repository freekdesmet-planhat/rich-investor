import { getTranslations } from 'next-intl/server';
import { RatioCard } from '@/components/RatioCard';
import type { RatioRow, SignalRow, Translation } from '@/lib/data/queries';
import type { Lang } from '@/lib/i18n/config';
import { stripSourceSuffix, unwrapParagraphs } from '@/lib/i18n/docs';
import { sourcesForRatio } from '@/lib/data/dataQuality';
import {
  isOverridden,
  overriddenTargetLabel,
  RATIO_THRESHOLD,
} from '@/lib/ratios/editableThresholds';
import { DEFAULT_THRESHOLDS } from '@/lib/ratios/thresholds';
import { formatBillions, formatNumber, formatPercent } from '@/lib/i18n/format';

/**
 * The metrics that carry a "distance to the rule's threshold" caption, with the
 * threshold in force and which way the rule runs (launch item 4). All four are
 * book thresholds, so there is nothing user-overridable to fold in here.
 */
const THRESHOLD_LINE: Record<
  string,
  { threshold: number; kind: 'minimum' | 'maximum'; percent: boolean }
> = {
  pe: { threshold: DEFAULT_THRESHOLDS.pe.value.green, kind: 'maximum', percent: false },
  roe: { threshold: DEFAULT_THRESHOLDS.roe.value.green, kind: 'minimum', percent: true },
  gross_margin: {
    threshold: DEFAULT_THRESHOLDS.grossMargin.value.green,
    kind: 'minimum',
    percent: true,
  },
  net_margin: { threshold: DEFAULT_THRESHOLDS.netMargin.value.green, kind: 'minimum', percent: true },
};

/**
 * Full grid order: valuation, then returns, then growth, then the core signal.
 * Shown in Full research.
 */
export const CARD_ORDER = [
  'pe',
  'peg',
  'ev_ebit',
  'p_fcf',
  'earnings_quality',
  'roe',
  'roa',
  'eps_growth',
  'revenue_growth',
  'gross_margin',
  'net_margin',
  'debt',
  'rnd_adjusted_pe',
  'payout_ratio',
  'dividend_yield',
  'inventory_receivables',
  'p_s',
  'p_b',
  'drawdown_5y',
  'market_cap',
] as const;

/**
 * The short row on the default stock page: one valuation pair, a return, a
 * margin and the balance-sheet check — the figures a verdict leans on hardest,
 * with everything else a click away.
 */
export const HEADLINE_RATIOS = ['pe', 'peg', 'roe', 'net_margin', 'debt'] as const;

/** A snapshot, only the parts the cards read. */
interface SnapshotLike {
  statement_sources?: Record<string, string | null> | null;
}

function formatRatio(row: RatioRow, lang: Lang): string {
  if (row.value == null) return '—';
  switch (row.unit) {
    case 'percent':
      return formatPercent(row.value, lang);
    case 'currency':
      return formatBillions(row.value, row.currency ?? 'USD', lang);
    default:
      return formatNumber(row.value, lang);
  }
}

/**
 * The checklist's pass mark, for the cards whose healthy target is stricter.
 *
 * Condition 8 passes at 70% of net income and condition 9 at net debt/EBITDA
 * 2.5, while those two cards state the healthy targets (1 and 1). Printing only
 * one of the pair made the page contradict itself, so both are shown and both
 * are read from the same constant — a change to `DEFAULT_THRESHOLDS` moves the
 * checklist and the card together.
 */
function checklistGate(ratioKey: string, lang: Lang): string | null {
  switch (ratioKey) {
    case 'debt':
      return `≤ ${formatNumber(DEFAULT_THRESHOLDS.debt.value.netDebtEbitdaOrange, lang, 1)}`;
    case 'earnings_quality':
      return `≥ ${formatPercent(DEFAULT_THRESHOLDS.earningsQuality.value.orange, lang, 0)}`;
    default:
      return null;
  }
}

/**
 * The grid of ratio cards, shared by the two places it now appears.
 *
 * The stock page shows a short row of headline ratios; Full research shows all
 * twenty. The per-card logic — PEG's two bases, the market-cap currency pair,
 * the neutral drawdown, the overridden targets — is identical in both, so it
 * lives here once rather than being copied and left to drift. The cards render
 * the numbers; nothing here computes a ratio or decides a colour. The values
 * arrive already computed in `byKey`.
 *
 * Four metrics (P/E, ROE, and the two margins) carry a one-line caption saying
 * how far the value sits from the rule's own threshold — "7.3 points above the
 * 15% minimum" — in place of the earlier watchlist-peer comparison, which said
 * something about the watchlist rather than about the method (launch item 4).
 */
export async function RatioGrid({
  keys,
  byKey,
  signal,
  docs,
  snapshot,
  thresholdOverrides,
  locale,
}: {
  keys: readonly string[];
  byKey: Map<string, RatioRow>;
  signal: SignalRow;
  docs: Map<string, Translation>;
  snapshot: SnapshotLike | null;
  thresholdOverrides: Record<string, Record<string, number>>;
  locale: Lang;
}) {
  const [tRatio, tSignal, tData] = await Promise.all([
    getTranslations('ratio'),
    getTranslations('signal'),
    getTranslations('data'),
  ]);

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {keys.map((key) => {
        const row = byKey.get(key as RatioRow['ratio_key']);
        if (!row) return null;
        const doc = docs.get(`ratio:${key}`);

        // PEG is judged on either the trailing or the forward figure, so
        // one number with one dot could contradict the checklist row
        // above: passed on expected growth, red dot on the trailing
        // figure. Both are shown, the one the condition used is
        // highlighted, and the dot follows the condition rather than the
        // trailing number alone.
        const pegCondition =
          key === 'peg' ? signal.checklist.find((c) => c.key === 'peg') : undefined;
        const pegDetail = (pegCondition?.detail ?? {}) as {
          trailingPeg?: number | null;
          forwardPeg?: number | null;
          trailingPasses?: boolean;
          forwardPasses?: boolean;
        };

        // The $10bn floor is stated in USD, so USD is the figure the
        // condition judges and stays the headline. The native figure sits
        // beside it, because that is the currency the price above is in.
        const capDetail =
          key === 'market_cap'
            ? (row.detail as {
                marketCapNative?: number | null;
                quoteCurrency?: string | null;
              })
            : null;
        const capVariants =
          capDetail?.marketCapNative != null &&
          capDetail.quoteCurrency &&
          capDetail.quoteCurrency !== 'USD'
            ? [
                {
                  label: 'USD',
                  value: formatBillions(row.value, 'USD', locale),
                  used: true,
                },
                {
                  label: capDetail.quoteCurrency,
                  value: formatBillions(
                    capDetail.marketCapNative,
                    capDetail.quoteCurrency,
                    locale,
                  ),
                  used: false,
                },
              ]
            : null;

        const variants = pegCondition
          ? [
              {
                label: tRatio('peg.trailing'),
                value: formatNumber(pegDetail.trailingPeg ?? row.value, locale),
                used: Boolean(pegDetail.trailingPasses),
              },
              {
                label: tRatio('peg.forward'),
                value: formatNumber(pegDetail.forwardPeg ?? null, locale),
                used: Boolean(pegDetail.forwardPasses),
              },
            ]
          : capVariants;

        const color = pegCondition
          ? pegCondition.passed
            ? 'green'
            : 'red'
          : row.color;

        // The same fact already sits under the Why block; it belongs on
        // the card that shows the number it is about.
        let caption =
          pegCondition && signal.peg_basis
            ? `PEG: ${tSignal(`pegBasis.${signal.peg_basis}`)}`
            : null;

        // The drawdown is rendered neutral now, because green and red
        // mean passed and failed everywhere else on this page. Whether it
        // clears the book's entry threshold is said in words instead.
        if (key === 'drawdown_5y') {
          const dd = row.detail as {
            meetsEntryThreshold?: boolean;
            approachingEntryThreshold?: boolean;
          };
          if (dd.meetsEntryThreshold) caption = tRatio('entryThreshold');
          else if (dd.approachingEntryThreshold) caption = tRatio('nearEntryThreshold');
        }

        // An ROE over 100% reads to a beginner as "makes 149% profit". It is a
        // small-equity artifact (buybacks), so the card says so and points at ROA
        // as the steadier measure — the same note the AI summary is told to give.
        if (key === 'roe' && row.value != null && row.value > 1) {
          caption = tRatio('roeBuybackNote');
        }

        // Distance to the rule's own threshold, in place of a watchlist-peer
        // comparison (launch item 4): "7.3 points above the 15% minimum" says
        // something about the method; "12% above the others you follow" did
        // not. Only where the card has nothing more pressing to say — the PEG,
        // drawdown and ROE-buyback captions above win the slot.
        if (caption == null) {
          const line = THRESHOLD_LINE[key];
          if (line && row.value != null) {
            const above = row.value > line.threshold;
            const distanceRaw = Math.abs(row.value - line.threshold);
            const distance = line.percent
              ? formatNumber(distanceRaw * 100, locale, 1)
              : formatNumber(distanceRaw, locale, 1);
            const thresholdText = line.percent
              ? formatPercent(line.threshold, locale, 0)
              : formatNumber(line.threshold, locale, 0);
            caption = tRatio
              .raw(above ? 'aboveThreshold' : 'belowThreshold')
              .replace('{distance}', distance)
              .replace('{threshold}', thresholdText)
              .replace('{kind}', tRatio(`thresholdKind.${line.kind}`));
          }
        }

        // The doc names the source in prose and the row carries it as
        // data; the card renders it once, from the data.
        // "app default" stopped being true the moment the household
        // changed the number, so the card says whose it is now. Read from
        // the current overrides rather than the stored row: a setting
        // changed today should not have to wait for tonight to be named
        // correctly, even though the figure it produced will.
        const editableKey = RATIO_THRESHOLD[key];
        const isMine = editableKey != null && isOverridden(editableKey, thresholdOverrides);
        const sourceLabel = isMine
          ? tRatio('source.your_setting')
          : tRatio(`source.${row.target_source}`);
        // The documented target is prose and does not follow the
        // threshold, so an overridden card builds its own rather than
        // printing "≤ 20 (your setting)" when the setting is 15.
        const targetLabel =
          overriddenTargetLabel(key, thresholdOverrides, (value) =>
            formatNumber(value, locale),
          ) ?? stripSourceSuffix(doc?.target ?? row.target_label);

        const detail = row.detail as { isApproximation?: boolean };
        const adjusted = row.is_adjusted
          ? {
              rawDisplayValue: formatPercent(row.raw_value, locale),
              rawLabel: tRatio('adjusted.raw'),
              adjustedLabel: tRatio('adjusted.label'),
              note: tRatio('adjusted.roaNote'),
              approximationNote: detail.isApproximation
                ? tRatio('adjusted.approximation')
                : null,
            }
          : null;

        return (
          <RatioCard
            key={key}
            ratioKey={key}
            name={doc?.name ?? key}
            // The markdown is hard-wrapped for an editor; the card is not an
            // editor, so the wrapping is undone and the browser decides.
            explanation={unwrapParagraphs(doc?.explanation ?? '')}
            displayValue={formatRatio(row, locale)}
            color={color}
            variants={variants}
            caption={caption}
            // On the two metrics whose card target (≤1, ≥1) is stricter than the
            // checklist pass mark (≤2.5, ≥70%), show only the pass mark — the number
            // that actually decides pass/fail — rather than two targets per card
            // (audit 24).
            targetLabel={checklistGate(key, locale) ?? targetLabel}
            targetSourceLabel={sourceLabel}
            gateLabel={null}
            history={row.history ?? []}
            unavailableLabel={
              row.value == null && row.unavailable_reason
                ? tRatio(`unavailable.${row.unavailable_reason}`)
                : null
            }
            adjusted={adjusted}
            provenance={{
              sources: sourcesForRatio(key, snapshot?.statement_sources),
              asOf: signal.as_of,
            }}
            labels={{
              explain: tRatio('explain'),
              target: tRatio('target'),
              fiveYears: tRatio('fiveYears'),
              close: tRatio('close'),
              source: tData.raw('metricSource') as string,
            }}
          />
        );
      })}
    </div>
  );
}
