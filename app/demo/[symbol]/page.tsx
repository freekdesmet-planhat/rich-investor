import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { VerdictRing } from '@/components/VerdictRing';
import { PriceChart } from '@/components/PriceChart';
import { RatioGrid, HEADLINE_RATIOS } from '@/components/RatioGrid';
import { WhyBlock } from '@/components/WhyBlock';
import { Card, Chip, Section, SectionHeading } from '@/components/ui/Surface';
import { getDemoStock, isDemoSymbol } from '@/lib/data/landing';
import { CONDITION_LABEL } from '@/lib/signal/explain';
import { pointsInRange } from '@/lib/data/priceRange';
import {
  formatBillions,
  formatCurrency,
  formatNumber,
  formatPercent,
} from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/config';
import { env } from '@/lib/env';

// Public, but not indexed until the data licence is settled (safety item 1).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol).toUpperCase();
  const t = await getTranslations('demo');
  return {
    title: `${sym} — Rich Investor (${t('badge')})`,
    // Not indexable until the finance-query display licence is settled (item 1).
    ...(env.publicIndexing() ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function DemoStockPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).toUpperCase();
  if (!isDemoSymbol(symbol)) notFound();

  const locale = (await getLocale()) as Lang;
  const [demo, tSignal, tSector, tStatus, tRatio, tChart, tDemo, tLanding] = await Promise.all([
    getDemoStock(symbol, locale),
    getTranslations('signal'),
    getTranslations('sector'),
    getTranslations('status'),
    getTranslations('ratio'),
    getTranslations('chart'),
    getTranslations('demo'),
    getTranslations('landing'),
  ]);
  if (!demo) notFound();

  const { signal, snapshot, ratios, docs } = demo;
  const byKey = new Map(ratios.map((r) => [r.ratio_key, r]));
  const name = snapshot?.quote?.name ?? docs.get(`company:${symbol}`)?.name ?? null;
  const why = locale === 'nl' ? signal.why_nl : signal.why_en;
  const whyParts = signal.why_parts ? signal.why_parts[locale] : null;

  const conditionValueText = (c: (typeof signal.checklist)[number]): string | null => {
    if (c.value == null || !c.applicable) return null;
    switch (c.key) {
      case 'drawdown':
      case 'returns':
        return formatPercent(c.value, locale, 0);
      case 'market_cap':
        return formatBillions(c.value, 'USD', locale);
      case 'pe':
      case 'peg':
      case 'cash_flow':
      case 'debt':
        return formatNumber(c.value, locale, 2);
      default:
        return null;
    }
  };

  const chartPoints = snapshot?.price_history
    ? pointsInRange(snapshot.price_history, '5y').map((p) => ({ date: p.date, close: p.close }))
    : [];

  return (
    <>
      <header className="border-line border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="text-base font-semibold tracking-tight text-ink">
            Rich Investor
          </Link>
          <Link
            href="/"
            className="border-line-strong text-ink-muted hover:bg-surface-hover rounded-md border px-3 py-1.5 text-sm transition"
          >
            {tDemo('cta')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* This is an example, not the reader's own analysis, and it is dated. */}
        <div className="border-near-line bg-near-wash text-near mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-sm">
          <span className="font-semibold uppercase tracking-wide">{tDemo('badge')}</span>
          <span className="text-ink-subtle">{tDemo('note', { date: signal.as_of })}</span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{symbol}</h1>
          {snapshot?.price != null && (
            <span className="text-xl font-medium tabular-nums text-ink-muted">
              {formatCurrency(snapshot.price, snapshot.currency, locale)}
            </span>
          )}
        </div>
        {name && <p className="mt-0.5 text-sm text-ink-subtle">{name}</p>}

        <div className="mt-4">
          <VerdictRing
            status={signal.status}
            met={signal.conditions_met}
            total={signal.conditions_applicable}
            headline={tStatus(`headline.${signal.status}`)}
            conditionsMet={tStatus('conditionsMet', {
              met: signal.conditions_met,
              total: signal.conditions_applicable,
            })}
          />
        </div>

        <div className="mt-3">
          <Chip>{tSector(signal.focus_sector)}</Chip>
        </div>

        {/* Checklist */}
        <Section>
          <SectionHeading>{tSignal('checklist')}</SectionHeading>
          <ul className="divide-line border-line divide-y overflow-hidden rounded-xl border text-sm">
            {signal.checklist.map((condition) => {
              const valueText = conditionValueText(condition);
              // Same failed-row treatment as the real stock page (item 3), so the
              // public showcase matches it: fail colour + "Not met" on a miss, a
              // "?" and "Can't judge" where there is no data. Greyscale-safe.
              const rowState: 'pass' | 'fail' | 'none' = !condition.applicable
                ? 'none'
                : condition.passed
                  ? 'pass'
                  : 'fail';
              const rowIcon = rowState === 'none' ? '?' : rowState === 'pass' ? '✓' : '✗';
              return (
                <li
                  key={condition.key}
                  className="bg-surface flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="flex min-w-0 items-start gap-2 sm:items-center">
                    <span
                      aria-hidden="true"
                      className={`w-4 shrink-0 text-center ${
                        rowState === 'fail'
                          ? 'text-fail font-semibold'
                          : rowState === 'pass'
                            ? 'text-pass'
                            : 'text-ink-faint'
                      }`}
                    >
                      {rowIcon}
                    </span>
                    <span className={rowState === 'none' ? 'text-ink-faint' : undefined}>
                      {docs.get(`condition:${condition.key}`)?.name ??
                        CONDITION_LABEL[condition.key]?.[locale] ??
                        condition.key}
                    </span>
                    {valueText && (
                      <span
                        className={`shrink-0 text-sm font-semibold tabular-nums ${
                          rowState === 'fail'
                            ? 'text-fail'
                            : rowState === 'none'
                              ? 'text-ink-faint'
                              : 'text-ink'
                        }`}
                      >
                        {valueText}
                      </span>
                    )}
                    {rowState === 'fail' && (
                      <span className="shrink-0 text-xs font-medium text-fail">
                        {tSignal('status.notMet')}
                      </span>
                    )}
                    {rowState === 'none' && (
                      <span className="shrink-0 text-xs font-medium text-ink-faint">
                        {tSignal('status.cantJudge')}
                      </span>
                    )}
                  </span>
                  <span className="text-ink-subtle pl-6 text-xs sm:shrink-0 sm:pl-0">
                    {!condition.applicable
                      ? tRatio('unavailable.not_applicable')
                      : (docs.get(`condition:${condition.key}`)?.target ?? condition.target)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Chart */}
        {chartPoints.length > 1 && (
          <Section>
            <PriceChart
              points={chartPoints}
              high={(byKey.get('drawdown_5y')?.detail as { high?: number | null })?.high ?? null}
              highDate={(byKey.get('drawdown_5y')?.detail as { highDate?: string | null })?.highDate ?? null}
              currency={snapshot?.currency ?? null}
              locale={locale}
              labels={{
                high: tChart('high'),
                now: tChart('now'),
                drawdown: tChart('drawdown'),
                entry: tChart('entry'),
                chart: tChart('label'),
              }}
            />
          </Section>
        )}

        {/* Why */}
        <Section>
          <SectionHeading>{tSignal('why.title')}</SectionHeading>
          <Card tone="sunken" padding="loose">
            <WhyBlock
              parts={whyParts}
              prose={why}
              labels={{
                passes: tSignal('why.passes'),
                missing: tSignal('why.missing'),
                check: tSignal('why.check'),
                fullReasoning: tSignal('why.full'),
              }}
            />
          </Card>
        </Section>

        {/* Ratios */}
        <Section>
          <SectionHeading>{tRatio('headline')}</SectionHeading>
          <RatioGrid
            keys={HEADLINE_RATIOS}
            byKey={byKey}
            signal={signal}
            docs={docs}
            snapshot={snapshot}
            thresholdOverrides={{}}
            locale={locale}
          />
        </Section>

        <div className="mt-10 border-t border-line pt-6">
          <Link
            href="/"
            className="bg-accent text-accent-ink hover:bg-accent-hover inline-block rounded-md px-4 py-2 text-sm font-medium transition"
          >
            {tDemo('cta')}
          </Link>
          <p className="text-ink-subtle mt-4 text-xs">{tLanding('notAdvice')}</p>
        </div>
      </main>
    </>
  );
}
