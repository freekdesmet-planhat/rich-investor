/**
 * Tests for how a target is shown on a ratio card and in the checklist.
 *
 * Two things went wrong here and both are cheap to pin down: the source was
 * printed twice on every card, and the checklist's pass mark disagreed with the
 * healthy target on the card beside it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from './config';
import { parseDocs, stripSourceSuffix } from './docs';
import { DEFAULT_THRESHOLDS } from '@/lib/ratios/thresholds';

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

const docs = Object.fromEntries(
  LOCALES.map((lang) => [lang, parseDocs(read(`docs/ratios.${lang}.md`))]),
) as Record<string, ReturnType<typeof parseDocs>>;

const target = (lang: string, key: string) =>
  docs[lang].find((e) => `${e.namespace}:${e.key}` === key)?.target ?? '';

describe('target source suffix', () => {
  it('removes the source annotation in both languages', () => {
    expect(stripSourceSuffix('maximum 30 (from the book)')).toBe('maximum 30');
    expect(stripSourceSuffix('≤ 25 (app default)')).toBe('≤ 25');
    expect(stripSourceSuffix('maximaal 30 (uit het boek)')).toBe('maximaal 30');
  });

  it('removes the Dutch annotation that is worded differently from the UI label', () => {
    // messages/nl.json shortens this to "standaardinstelling"; matching the
    // label exactly left the longer prose form on the card next to it.
    expect(stripSourceSuffix('≤ 20 (standaardinstelling van de app)')).toBe('≤ 20');
  });

  it('leaves a target without an annotation alone', () => {
    const plain = 'informational, no colour code';
    expect(stripSourceSuffix(plain)).toBe(plain);
  });

  /**
   * A parenthetical is not automatically a source annotation. Some qualify the
   * number instead, and stripping those deletes the part that says which figure
   * is being judged.
   */
  it('keeps a trailing parenthetical that qualifies the number', () => {
    expect(stripSourceSuffix('≤ 20 (R&D-adjusted)')).toBe('≤ 20 (R&D-adjusted)');
    expect(stripSourceSuffix('≤ 2.5 (net of cash)')).toBe('≤ 2.5 (net of cash)');
    expect(stripSourceSuffix('≥ 50% (5-year high)')).toBe('≥ 50% (5-year high)');
  });

  it('still strips an annotation that follows another parenthetical', () => {
    expect(stripSourceSuffix('≤ 20 (R&D-adjusted) (from the book)')).toBe('≤ 20 (R&D-adjusted)');
  });

  it('keeps a target that is nothing but a parenthetical', () => {
    expect(stripSourceSuffix('(from the book)')).toBe('(from the book)');
  });

  it('leaves no annotation on any documented target', () => {
    for (const lang of LOCALES) {
      for (const entry of docs[lang]) {
        if (entry.target === '') continue;
        const once = stripSourceSuffix(entry.target);
        expect(once, `${lang} ${entry.namespace}:${entry.key}`).not.toMatch(/\)\s*$/);
      }
    }
  });
});

describe('checklist gate versus card target', () => {
  /**
   * Two conditions pass on a looser number than the card beside them states
   * (net debt/EBITDA and cash-flow quality). Both appear on the same page, so
   * the prose in the docs has to keep quoting what the constants say.
   */
  it('quotes the same debt numbers as the constants', () => {
    const { netDebtEbitdaGreen, netDebtEbitdaOrange } = DEFAULT_THRESHOLDS.debt.value;

    expect(target('en', 'condition:debt')).toContain(String(netDebtEbitdaOrange));
    expect(target('nl', 'condition:debt')).toContain(String(netDebtEbitdaOrange).replace('.', ','));
    expect(target('en', 'ratio:debt')).toContain(String(netDebtEbitdaGreen));
  });

  it('quotes the same cash-flow numbers as the constants', () => {
    const gate = Math.round(DEFAULT_THRESHOLDS.earningsQuality.value.orange * 100);

    expect(target('en', 'condition:cash_flow')).toContain(`${gate}%`);
    expect(target('nl', 'condition:cash_flow')).toContain(`${gate}%`);
  });
});

describe('checklist criteria', () => {
  it('has a localised target for every condition the engine reports', () => {
    const conditions = docs.en.filter((e) => e.namespace === 'condition');
    expect(conditions.length).toBe(9);

    for (const lang of LOCALES) {
      for (const entry of conditions) {
        const localised = target(lang, `condition:${entry.key}`);
        expect(localised, `${lang} condition:${entry.key}`).not.toBe('');
      }
    }
  });

  it('translates the Dutch criteria rather than repeating the English', () => {
    // The checklist used to render the engine's English target on both
    // languages; these are the rows that gave it away.
    for (const key of ['returns', 'cash_flow', 'debt', 'focus_sector']) {
      expect(target('nl', `condition:${key}`)).not.toBe(target('en', `condition:${key}`));
    }
  });
});
