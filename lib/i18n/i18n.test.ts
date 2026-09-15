/**
 * i18n tests.
 *
 * The hard requirement from section 2 is that both languages always exist
 * together. These tests fail if a key appears in one language and not the
 * other, in either the message catalogs or the ratio documentation.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage, isLang, LOCALES } from './config';
import { parseDocs } from './docs';
import { formatBillions, formatCurrency, formatNumber, formatPercent } from './format';

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('message catalogs', () => {
  const en = JSON.parse(read('messages/en.json'));
  const nl = JSON.parse(read('messages/nl.json'));

  it('cover exactly the same keys in both languages', () => {
    const a = flatten(en).sort();
    const b = flatten(nl).sort();
    expect(b).toEqual(a);
  });

  it('has no empty string anywhere', () => {
    for (const [name, catalog] of [['en', en], ['nl', nl]] as const) {
      const walk = (value: unknown, trail: string): void => {
        if (typeof value === 'string') {
          expect(value.trim(), `${name}.${trail}`).not.toBe('');
          return;
        }
        for (const [key, child] of Object.entries(value as object)) {
          walk(child, trail ? `${trail}.${key}` : key);
        }
      };
      walk(catalog, '');
    }
  });

  it('carries the disclaimer in both languages', () => {
    expect(en.app.disclaimer).toBe('This is a personal analysis tool, not investment advice.');
    expect(nl.app.disclaimer).toBe('Dit is een persoonlijke analysetool, geen beleggingsadvies.');
  });
});

describe('ratio documentation', () => {
  const docs = Object.fromEntries(
    LOCALES.map((lang) => [lang, parseDocs(read(`docs/ratios.${lang}.md`))]),
  );

  it('parses every block into name, target and explanation', () => {
    for (const lang of LOCALES) {
      expect(docs[lang].length).toBeGreaterThan(25);
      for (const entry of docs[lang]) {
        expect(entry.namespace, `${lang}:${entry.key}`).toMatch(/^(ratio|lynch|condition|catalyst|sell_signal)$/);
        expect(entry.name, `${lang}:${entry.key} name`).not.toBe('');
        expect(entry.explanation.length, `${lang}:${entry.key} explanation`).toBeGreaterThan(40);
      }
    }
  });

  it('covers the same keys in both languages', () => {
    const keys = (lang: string) =>
      docs[lang].map((e) => `${e.namespace}:${e.key}`).sort();
    expect(keys('nl')).toEqual(keys('en'));
  });

  it('documents every ratio the engine computes', async () => {
    const { computeAllRatios, buildContext } = await import('@/lib/ratios/engine');
    const empty = {
      symbol: 'X',
      asOf: '2026-01-01',
      quote: null,
      statements: {
        income: { annual: null, quarterly: null },
        balance: { annual: null, quarterly: null },
        cash: { annual: null, quarterly: null },
      },
      priceHistory: [],
      estimates: null,
      filingCurrency: null,
      statementSources: { income: null, balance: null, cash: null },
      estimatesSource: null,
      isStale: false,
      staleAsOf: null,
      errors: [],
    };
    const ratioKeys = Object.keys(computeAllRatios(buildContext(empty), 'high_growth'));
    const documented = new Set(
      docs.en.filter((e) => e.namespace === 'ratio').map((e) => e.key),
    );

    for (const key of ratioKeys) expect(documented, `ratio:${key}`).toContain(key);
  });
});

describe('locale detection', () => {
  it('picks the highest-weighted supported language', () => {
    expect(localeFromAcceptLanguage('nl-NL,nl;q=0.9,en;q=0.8')).toBe('nl');
    expect(localeFromAcceptLanguage('en-GB,en;q=0.9')).toBe('en');
    expect(localeFromAcceptLanguage('de-DE,de;q=0.9,nl;q=0.5')).toBe('nl');
  });

  it('returns null when nothing is supported, so the caller can default', () => {
    expect(localeFromAcceptLanguage('de-DE,fr;q=0.8')).toBeNull();
    expect(localeFromAcceptLanguage(null)).toBeNull();
  });

  it('validates stored preferences', () => {
    expect(isLang('nl')).toBe(true);
    expect(isLang('de')).toBe(false);
  });
});

describe('locale-aware formatting', () => {
  it('formats the same value differently per locale but never changes it', () => {
    expect(formatNumber(1234.56, 'en')).toBe('1,234.56');
    expect(formatNumber(1234.56, 'nl')).toBe('1.234,56');
  });

  it('formats currency per locale', () => {
    expect(formatCurrency(1234.56, 'USD', 'en')).toContain('1,234.56');
    expect(formatCurrency(1234.56, 'USD', 'nl')).toContain('1.234,56');
  });

  it('formats percentages per locale', () => {
    expect(formatPercent(0.2385, 'en')).toBe('23.9%');
    expect(formatPercent(0.2385, 'nl')).toBe('23,9%');
  });

  it('renders billions readably in both languages', () => {
    expect(formatBillions(652_317_032_448, 'USD', 'en')).toContain('652.3');
    expect(formatBillions(652_317_032_448, 'USD', 'nl')).toContain('652,3');
  });

  /**
   * Past a thousand billion the billions figure needs four digits, and
   * "$4,273.0B" is neither speakable nor comparable at a glance with "$105.6B".
   */
  it('switches to trillions when billions would need four digits', () => {
    expect(formatBillions(4_273_000_000_000, 'USD', 'en')).toContain('4.27');
    expect(formatBillions(4_273_000_000_000, 'USD', 'en')).toMatch(/T$/);
    expect(formatBillions(4_273_000_000_000, 'USD', 'nl')).toContain('4,27');
    expect(formatBillions(4_273_000_000_000, 'USD', 'nl')).toMatch(/bln$/);
  });

  it('stays in billions right up to the threshold', () => {
    expect(formatBillions(999_000_000_000, 'USD', 'en')).toMatch(/B$/);
    expect(formatBillions(1_000_000_000_000, 'USD', 'en')).toMatch(/T$/);
  });

  it('renders a dash rather than NaN for missing values', () => {
    expect(formatNumber(null, 'en')).toBe('—');
    expect(formatPercent(null, 'nl')).toBe('—');
    expect(formatCurrency(null, 'USD', 'en')).toBe('—');
  });
});
