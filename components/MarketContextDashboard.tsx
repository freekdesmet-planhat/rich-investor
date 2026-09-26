import { getLocale, getTranslations } from 'next-intl/server';
import {
  buffettTone,
  concentrationTone,
  yieldTone,
  type MacroTone,
} from '@/lib/macro/fetch';
import { createClient } from '@/lib/supabase/server';
import type { Lang } from '@/lib/i18n/config';
import { formatNumber } from '@/lib/i18n/format';
import { MacroCard } from './MacroCard';
import { SectionHeading } from './ui/Surface';

interface MacroRow {
  date: string;
  buffett_indicator: number | null;
  yield_spread_10y2y: number | null;
  spy_rsp_spread: number | null;
  sp500_pe: number | null;
  errors: string[] | null;
}

/**
 * The market-wide block (section 5.20), above the watchlist.
 *
 * Deliberately the first thing on the page and deliberately not per-stock: the
 * book frames this as weather rather than a signal — it tells you how hard the
 * hunting will be, not what to buy. Nothing here feeds the buy-worthy logic.
 *
 * Renders nothing at all when no snapshot exists yet, rather than a row of
 * empty cards.
 */
export async function MarketContextDashboard() {
  const locale = (await getLocale()) as Lang;
  const [t, tRatio] = await Promise.all([getTranslations('macro'), getTranslations('ratio')]);

  const supabase = await createClient();
  const { data } = await supabase
    .from('macro_context')
    .select('date,buffett_indicator,yield_spread_10y2y,spy_rsp_spread,sp500_pe,errors')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle<MacroRow>();

  if (!data) return null;

  const spread = data.yield_spread_10y2y;
  const concentration = data.spy_rsp_spread;

  // A one-line temperature reading is what the page needs above the watchlist;
  // the four cards are detail behind an expander (launch item 9).
  const temperature = buffettTone(data.buffett_indicator);
  const tempWord =
    temperature === 'warn' ? t('temp.expensive') : temperature === 'good' ? t('temp.cheap') : t('temp.fair');
  const buffettValue =
    data.buffett_indicator != null ? `${formatNumber(data.buffett_indicator, locale, 0)}%` : t('unavailable');

  const cards: Array<{
    key: string;
    name: string;
    help: string;
    value: string;
    tone: MacroTone;
    note?: string;
  }> = [
    {
      key: 'buffett',
      name: t('buffett.name'),
      help: t('buffett.help'),
      value:
        data.buffett_indicator != null
          ? `${formatNumber(data.buffett_indicator, locale, 0)}%`
          : t('unavailable'),
      tone: buffettTone(data.buffett_indicator),
    },
    {
      key: 'yieldSpread',
      name: t('yieldSpread.name'),
      help: t('yieldSpread.help'),
      value: spread != null ? `${formatNumber(spread, locale, 2)}` : t('unavailable'),
      tone: yieldTone(spread),
      note:
        spread == null
          ? undefined
          : spread < 0
            ? t('yieldSpread.inverted')
            : t('yieldSpread.normal'),
    },
    {
      key: 'concentration',
      name: t('concentration.name'),
      help: t('concentration.help'),
      value:
        concentration != null
          ? `${concentration > 0 ? '+' : ''}${formatNumber(concentration, locale, 1)} pp`
          : t('unavailable'),
      tone: concentrationTone(concentration),
      note:
        concentration == null
          ? undefined
          : concentration > 5
            ? t('concentration.narrow')
            : t('concentration.broad'),
    },
    {
      key: 'sp500Pe',
      name: t('sp500Pe.name'),
      help: t('sp500Pe.help'),
      value: data.sp500_pe != null ? formatNumber(data.sp500_pe, locale, 1) : t('unavailable'),
      tone: 'neutral',
    },
  ];

  return (
    <details className="border-line group mb-6 rounded-xl border bg-surface-sunken px-3 py-2">
      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-sm marker:content-none">
        <span className="text-ink-muted">
          {t('summary', { temp: tempWord, value: buffettValue })}
        </span>
        {temperature === 'warn' && (
          <span className="text-ink-subtle">{t('expectFew')}</span>
        )}
        <span className="text-accent ml-auto text-xs underline underline-offset-2 group-open:hidden">
          {t('detail')}
        </span>
      </summary>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <SectionHeading>{t('title')}</SectionHeading>
        <p className="text-ink-faint text-xs">{t('asOf', { date: data.date })}</p>
      </div>
      <p className="text-ink-subtle mb-3 text-xs">{t('subtitle')}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <MacroCard
            key={card.key}
            name={card.name}
            help={card.help}
            value={card.value}
            tone={card.tone}
            note={card.note}
            explainLabel={tRatio('explain')}
          />
        ))}
      </div>

      {data.errors && data.errors.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {data.errors.map((error, i) => (
            <li key={i} className="text-ink-faint text-xs">
              {error}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
