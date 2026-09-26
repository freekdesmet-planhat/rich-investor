/**
 * The HTML digest body.
 *
 * Mail clients are the constraint here, not browsers: Outlook renders with
 * Word's engine and Gmail strips <head>, so the tests check the things that
 * actually break — layout that is not a table, styles that are not inline,
 * links that are not absolute — rather than how it looks.
 */
import { describe, expect, it } from 'vitest';
import { escapeHtml, renderDigestHtml } from './digest-email';
import type { DigestEntry } from '@/lib/pipeline/digest';

const entry = (overrides: Partial<DigestEntry> = {}): DigestEntry => ({
  symbol: 'ADYEN.AS',
  name: 'Adyen N.V.',
  status: 'buy_worthy',
  previousStatus: 'almost',
  conditionsMet: 9,
  conditionsApplicable: 9,
  missing: [],
  peg: 1.17,
  forwardPeg: 0.71,
  roe: 0.223,
  roa: 0.18,
  drawdown: -0.662,
  thesis: null,
  ...overrides,
});

const render = (entries: DigestEntry[], lang: 'en' | 'nl' = 'en') =>
  renderDigestHtml({
    entries,
    asOf: '2026-09-14',
    lang,
    baseUrl: 'https://richinvestor.netlify.app',
    subject: lang === 'nl' ? '1 aandeel met complete checklist' : '1 stock completed the checklist',
  });

describe('mail-client compatibility', () => {
  it('lays out with tables, not flexbox or grid', () => {
    const html = render([entry()]);
    expect(html).toContain('<table role="presentation"');
    expect(html).not.toMatch(/display:\s*flex/);
    expect(html).not.toMatch(/display:\s*grid/);
  });

  it('carries no stylesheet a client could strip', () => {
    const html = render([entry()]);
    expect(html).not.toContain('<style');
    expect(html).not.toContain('<link');
    expect(html).not.toContain('class="');
  });

  it('links absolutely, since a mail has no origin to be relative to', () => {
    const html = render([entry()]);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.every((h) => h.startsWith('https://'))).toBe(true);
    expect(html).toContain('https://richinvestor.netlify.app/stock/ADYEN.AS');
  });

  it('encodes a ticker that needs it', () => {
    const html = render([entry({ symbol: 'BRK.B' })]);
    expect(html).toContain('/stock/BRK.B');
  });

  it('pins a width every client agrees on', () => {
    expect(render([entry()])).toContain('width="600"');
  });
});

describe('what it shows', () => {
  it('leads with what flipped, and links to it', () => {
    const html = render([entry()]);
    expect(html).toContain('Checklist now complete');
    expect(html).toContain('ADYEN.AS');
    expect(html).toContain('Open analysis');
  });

  it('names the blocking condition for a stock one short', () => {
    const html = render([
      entry({ status: 'almost', previousStatus: 'almost', conditionsMet: 8, missing: ['drawdown'] }),
    ]);
    expect(html).toContain('One condition away');
    expect(html).toContain('decline from the 5-year high');
  });

  it('shows the valuation figures when it has them', () => {
    const html = render([entry()]);
    expect(html).toContain('PEG');
    expect(html).toContain('1.17');
    expect(html).toContain('0.71');
    expect(html).toContain('ROE');
    expect(html).toContain('22.3%');
  });

  it('omits a figure it does not have rather than printing a blank', () => {
    const html = render([entry({ peg: null, forwardPeg: null, roe: null, roa: null, drawdown: null })]);
    expect(html).not.toContain('PEG&nbsp;');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('includes the stored summary when there is one', () => {
    const html = render([entry({ thesis: 'Adobe presents a classic Lynch dilemma.\n\nSecond paragraph.' })]);
    expect(html).toContain('Adobe presents a classic Lynch dilemma.');
    // Only the opening paragraph: a digest is a digest.
    expect(html).not.toContain('Second paragraph.');
  });

  it('drops a section that has nothing in it', () => {
    const html = render([entry()]);
    expect(html).toContain('Checklist now complete');
    expect(html).not.toContain('One condition away');
  });
});

describe('language', () => {
  it('writes the whole mail in Dutch', () => {
    const html = render(
      [entry({ status: 'almost', previousStatus: 'almost', conditionsMet: 8, missing: ['drawdown'] })],
      'nl',
    );
    expect(html).toContain('lang="nl"');
    expect(html).toContain('Nog één voorwaarde');
    expect(html).toContain('daling vanaf de 5-jaarstop');
    expect(html).toContain('geen beleggingsadvies');
    expect(html).not.toContain('One condition away');
    expect(html).not.toContain('investment advice.');
  });

  it('writes Dutch decimals with a comma', () => {
    const html = render([entry()], 'nl');
    expect(html).toContain('1,17');
    expect(html).not.toContain('1.17');
  });
});

describe('escaping', () => {
  it('escapes the characters that would break the markup', () => {
    expect(escapeHtml('Procter & Gamble')).toBe('Procter &amp; Gamble');
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  /** Company names come from a market-data provider, not from us. */
  it('escapes a company name rather than trusting it', () => {
    const html = render([entry({ name: 'Smith & Sons <b>Ltd</b>' })]);
    expect(html).toContain('Smith &amp; Sons &lt;b&gt;Ltd&lt;/b&gt;');
    expect(html).not.toContain('<b>Ltd</b>');
  });
});
