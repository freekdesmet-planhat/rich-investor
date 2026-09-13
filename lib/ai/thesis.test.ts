/**
 * AI thesis tests.
 *
 * The behaviour that matters most here is what happens without an API key: the
 * app has to keep working, and a placeholder must never be mistakable for a
 * real analysis.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  buildUserMessage,
  generateThesis,
  parseThesisJson,
  type ThesisContext,
} from './thesis';

const context = (overrides: Partial<ThesisContext> = {}): ThesisContext => ({
  symbol: 'ADYEN.AS',
  name: 'Adyen N.V.',
  focusSector: 'financial_services_non_bank',
  lynchCategory: 'high_growth',
  status: 'buy_worthy',
  conditionsMet: 9,
  conditionsApplicable: 9,
  checklist: [
    { key: 'drawdown', applicable: true, passed: true, target: '≥ 50%' },
    { key: 'peg', applicable: true, passed: true, target: '≤ 1' },
    { key: 'cash_flow', applicable: false, passed: false, target: 'FCF positive' },
  ],
  peg: 1.17,
  forwardPeg: 0.71,
  pegBasis: 'forward',
  roe: 0.223,
  roa: 0.18,
  roaIsAdjusted: true,
  epsGrowth: 0.227,
  debt: -7.52,
  earningsQuality: 0.97,
  drawdown: -0.662,
  ...overrides,
});

const originalKey = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe('the prompt sent to the model', () => {
  it('carries the identity, sector and growth category', () => {
    const message = buildUserMessage(context());

    expect(message).toContain('Adyen N.V. (ADYEN.AS)');
    expect(message).toContain('financial_services_non_bank');
    expect(message).toContain('high_growth');
  });

  it('carries the nine-point checklist with each outcome and target', () => {
    const message = buildUserMessage(context());

    expect(message).toContain('drawdown: PASS (target: ≥ 50%)');
    expect(message).toContain('peg: PASS (target: ≤ 1)');
    // A condition that does not apply is neither a pass nor a fail.
    expect(message).toContain('cash_flow: n/a');
  });

  it('carries PEG, ROE and ROA, and says when the ROA was adjusted', () => {
    const message = buildUserMessage(context());

    expect(message).toContain('PEG (trailing): 1.17');
    expect(message).toContain('PEG (forward): 0.71');
    expect(message).toContain('condition satisfied on: forward');
    expect(message).toContain('ROE: 22.3%');
    expect(message).toContain('ROA: 18.0% (adjusted for settlement balances)');
  });

  it('writes "unknown" rather than a misleading zero for a missing figure', () => {
    const message = buildUserMessage(context({ peg: null, roe: null }));

    expect(message).toContain('PEG (trailing): unknown');
    expect(message).toContain('ROE: unknown');
    expect(message).not.toContain('ROE: 0.0%');
  });
});

describe('without an API key', () => {
  it('returns a placeholder instead of failing, and flags it as one', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateThesis(context());

    expect(result.isMock).toBe(true);
    expect(result.model).toBe('mock');
    expect(result.en).toContain('ANTHROPIC_API_KEY is not set');
    expect(warn).toHaveBeenCalled();
  });

  /** Section 2: generated content never exists in one language without the other. */
  it('still produces both languages', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateThesis(context());

    expect(result.en.length).toBeGreaterThan(40);
    expect(result.nl.length).toBeGreaterThan(40);
    expect(result.nl).toContain('Voorbeeldtekst');
    expect(result.en).not.toBe(result.nl);
  });

  it('still cites the real figures, so the placeholder is not fiction', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateThesis(context());

    expect(result.en).toContain('ADYEN.AS');
    expect(result.en).toContain('9 of 9');
    expect(result.en).toContain('1.17');
  });

  it('reports no token usage, since nothing was spent', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await generateThesis(context());

    expect(result.inputTokens).toBeNull();
    expect(result.outputTokens).toBeNull();
  });
});

describe('parsing the dual-language reply', () => {
  it('reads a bare JSON object', () => {
    expect(parseThesisJson('{"en":"Bull case.","nl":"Bullcase."}')).toEqual({
      en: 'Bull case.',
      nl: 'Bullcase.',
    });
  });

  /** The classic failure: the model wraps its JSON in a code fence. */
  it('reads JSON wrapped in a code fence', () => {
    const raw = '```json\n{"en":"Bull case.","nl":"Bullcase."}\n```';
    expect(parseThesisJson(raw)?.en).toBe('Bull case.');
  });

  it('reads JSON preceded by a stray sentence', () => {
    const raw = 'Here is the summary:\n{"en":"Bull case.","nl":"Bullcase."}';
    expect(parseThesisJson(raw)?.nl).toBe('Bullcase.');
  });

  /** Half a bilingual summary is not a summary — the caller must know. */
  it('rejects a reply missing one language', () => {
    expect(parseThesisJson('{"en":"Only English."}')).toBeNull();
    expect(parseThesisJson('{"en":"","nl":"Alleen Nederlands."}')).toBeNull();
  });

  it('rejects text that is not JSON at all', () => {
    expect(parseThesisJson('The bull case is strong.')).toBeNull();
    expect(parseThesisJson('')).toBeNull();
  });

  it('rejects a reply truncated mid-object', () => {
    expect(parseThesisJson('{"en":"Bull case.","nl":"Bullca')).toBeNull();
  });
});
