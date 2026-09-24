import { getTranslations } from 'next-intl/server';
import { RatioCard } from '@/components/RatioCard';
import type { RatioRow, SignalRow, Translation } from '@/lib/data/queries';
import type { PeerSummary } from '@/lib/data/peerComparison';
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
 * Peer comparison is no longer its own section. For the four metrics it covers
 * (P/E, ROE, and the two margins) it collapses to a one-line caption on the
 * card itself — "vs. the others you follow: 12% below" — read from the same
 * watchlist median as before, and never called a sector median, because it is
 * not one (see peerComparison.ts).
 */
export async function RatioGrid({
  keys,
  byKey,
  signal,
  docs,
  snapshot,
  thresholdOverrides,
  peers,
  locale,
}: {
  keys: readonly string[];
  byKey: Map<string, RatioRow>;
  signal: SignalRow;
  docs: Map<string, Translation>;
  snapshot: SnapshotLike | null;
  thresholdOverrides: Record<string, Record<string, number>>;
  peers: PeerSummary | null;
  locale: Lang;
}) {
  const [tRatio, tSignal, tData, tPeers] = await Promise.all([
    getTranslations('ratio'),
    getTranslations('signal'),
    getTranslations('data'),
    getTranslations('peers'),
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

        // Peer comparison, downgraded from a section to a caption. Only for
        // the metrics it covers, and only where the card has nothing more
        // pressing to say — the PEG and drawdown captions above win the slot.
        if (caption == null) {
          const cmp = peers?.comparisons.find((c) => c.metric === key);
          if (cmp) {
            const rounded = Math.round(Math.abs(cmp.differencePercent));
            const delta =
              rounded < 1
                ? tPeers('level')
                : (cmp.differencePercent > 0 ? tPeers.raw('above') : tPeers.raw('below')).replace(
                    '{percent}',
                    String(rounded),
                  );
            caption = `${tPeers('vsMedian')}: ${delta}`;
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
            targetLabel={targetLabel}
            targetSourceLabel={sourceLabel}
            gateLabel={(() => {
              const gate = checklistGate(key, locale);
              return gate ? tRatio('gate', { value: gate }) : null;
            })()}
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
