/**
 * Unwrapping the help text.
 *
 * The markdown is hard-wrapped at about 85 columns so it reads and diffs well
 * in an editor. The card is not an editor, and honouring those newlines turned
 * every explanation into a column of short ragged lines.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from './config';
import { parseDocs, unwrapParagraphs } from './docs';

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

describe('unwrapParagraphs', () => {
  it('joins lines inside a paragraph with a space', () => {
    const wrapped = 'The best-known valuation metric, but incomplete on its\nown: it looks at a single year.';
    expect(unwrapParagraphs(wrapped)).toBe(
      'The best-known valuation metric, but incomplete on its own: it looks at a single year.',
    );
  });

  it('keeps a blank line as a real paragraph break', () => {
    const text = 'First paragraph\nwrapped here.\n\nSecond paragraph\nalso wrapped.';
    expect(unwrapParagraphs(text)).toBe('First paragraph wrapped here.\n\nSecond paragraph also wrapped.');
  });

  it('leaves a list alone, because a bullet is not a paragraph', () => {
    const list = 'Consider:\n\n- earnings growth\n- debt resilience\n- cash flow';
    expect(unwrapParagraphs(list)).toBe('Consider:\n\n- earnings growth\n- debt resilience\n- cash flow');
  });

  it('leaves already-unwrapped prose unchanged', () => {
    const plain = 'One long line that was never wrapped.';
    expect(unwrapParagraphs(plain)).toBe(plain);
  });

  it('is idempotent', () => {
    const text = 'A paragraph\nwrapped once.\n\nAnd another\none.';
    const once = unwrapParagraphs(text);
    expect(unwrapParagraphs(once)).toBe(once);
  });

  it('collapses no text away', () => {
    const text = 'Alpha beta\ngamma delta.\n\nEpsilon.';
    const words = (s: string) => s.split(/\s+/).filter(Boolean);
    expect(words(unwrapParagraphs(text))).toEqual(words(text));
  });
});

describe('every documented explanation', () => {
  /**
   * The symptom, stated as a property: after unwrapping, no explanation should
   * contain a newline that is not a paragraph break or a list item.
   */
  it('has no mid-paragraph line breaks left in either language', () => {
    for (const lang of LOCALES) {
      for (const entry of parseDocs(read(`docs/ratios.${lang}.md`))) {
        const unwrapped = unwrapParagraphs(entry.explanation);
        for (const paragraph of unwrapped.split('\n\n')) {
          const isList = /^\s*([-*+]|\d+[.)])\s/m.test(paragraph);
          if (isList) continue;
          expect(paragraph, `${lang} ${entry.namespace}:${entry.key}`).not.toContain('\n');
        }
      }
    }
  });

  it('was genuinely wrapped before, so the fix is not a no-op', () => {
    const wrapped = parseDocs(read('docs/ratios.en.md')).filter((e) =>
      e.explanation.split('\n\n').some((p) => !/^\s*([-*+]|\d+[.)])\s/m.test(p) && p.includes('\n')),
    );
    expect(wrapped.length).toBeGreaterThan(20);
  });
});
