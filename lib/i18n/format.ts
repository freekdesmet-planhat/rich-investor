/**
 * Locale-aware formatting.
 *
 * Numbers and currency follow the active language — "$1,234.56" in English,
 * "$ 1.234,56" in Dutch — while the underlying values stay identical
 * (section 2).
 */
import { INTL_LOCALE, type Lang } from './locale';

export function formatNumber(value: number | null, lang: Lang, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(INTL_LOCALE[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number | null, lang: Lang, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(INTL_LOCALE[lang], {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCurrency(
  value: number | null,
  currency: string | null,
  lang: Lang,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (!currency) return formatNumber(value, lang, digits);
  return new Intl.NumberFormat(INTL_LOCALE[lang], {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Large money at the scale it is spoken about.
 *
 * Billions for most companies, because that is how a market cap is read — and
 * trillions past a thousand of them, because "$4,273.0B" is a number nobody
 * says out loud and nobody can compare at a glance to "$105.6B". The threshold
 * is the point where the billions figure needs four digits.
 */
export function formatBillions(
  value: number | null,
  currency: string | null,
  lang: Lang,
): string {
  if (value == null || !Number.isFinite(value)) return '—';

  const billions = value / 1e9;
  if (Math.abs(billions) >= 1_000) {
    const suffix = lang === 'nl' ? ' bln' : 'T';
    return `${formatCurrency(billions / 1_000, currency, lang, 2)}${suffix}`;
  }

  const suffix = lang === 'nl' ? ' mld' : 'B';
  return `${formatCurrency(billions, currency, lang, 1)}${suffix}`;
}

export function formatDate(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat(INTL_LOCALE[lang], { dateStyle: 'medium' }).format(new Date(ms));
}
