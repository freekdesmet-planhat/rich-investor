/**
 * AI thesis tests.
 *
 * These exercise the thesis module against the provider *interface*, not a
 * vendor SDK — which is the point of the seam: swapping provider must not
 * rewrite this file.
 *
 * Two behaviours matter most. Without a configured provider nothing is
 * generated and nothing is stored: the placeholder that used to be returned
 * here is what put "Placeholder — no API key" on a stock page as though it were
 * an analysis. And a generation that does not finish cleanly raises a code
 * rather than returning half a summary.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import type { ThesisProviderRequest, ThesisProviderResult } from '@/lib/thesis/provider';

/** What the fake provider does on the next call, set per test. */
const fake: {
  configured: boolean;
  deltas: string[];
  truncated: boolean;
  throws: unknown;
  lastRequest: ThesisProviderRequest | null;
} = { configured: true, deltas: [], truncated: false, throws: null, lastRequest: null };

vi.mock('@/lib/thesis/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/thesis/provider')>();
  return {
    ...actual,
    thesisProvider: () => ({
      model: 'fake-model',
      isConfigured: () => fake.configured,
      async *stream(request: ThesisProviderRequest): AsyncGenerator<string, ThesisProviderResult> {
        fake.lastRequest = request;
        if (fake.throws) throw fake.throws;
        for (const text of fake.deltas) yield text;
        return {
          model: 'fake-model',
          inputTokens: 111,
          outputTokens: 222,
          truncated: fake.truncated,
        };
      },
    }),
  };
});

const { buildUserMessage, streamThesis, systemPromptFor, thesisEnabled, ThesisError, unmatchedNumbers } =
  await import('./thesis');
const { ThesisProviderError } = await import('@/lib/thesis/provider');
type ThesisContext = import('./thesis').ThesisContext;

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

async function run(lang: 'en' | 'nl' = 'en') {
  const generation = streamThesis(context(), lang);
  const deltas: string[] = [];
  let step = await generation.next();
  while (!step.done) {
    deltas.push(step.value);
    step = await generation.next();
  }
  return { deltas, result: step.value };
}

beforeEach(() => {
  fake.configured = true;
  fake.deltas = ['The bull case ', 'is strong.'];
  fake.truncated = false;
  fake.throws = null;
  fake.lastRequest = null;
});

afterEach(() => vi.restoreAllMocks());

describe('prompt guardrails (A7)', () => {
  it('does not name investors or investing styles', () => {
    const p = systemPromptFor('en');
    expect(p).not.toContain('Peter Lynch');
    expect(p).not.toContain('One Up on Wall Street');
    expect(p).toContain('Do not name investors');
  });
  it('forbids superlatives, buy/sell language, price targets and invented numbers', () => {
    const p = systemPromptFor('en');
    expect(p).toContain('No superlatives');
    expect(p).toContain('Do not tell the reader to buy, sell');
    expect(p).toContain('no price targets');
    expect(p).toContain('Every number you write must be one of the figures given');
  });
});

describe('numbers guardrail (A7)', () => {
  const given = buildUserMessage(context());
  it('accepts an output whose figures are all from the data', () => {
    // 1.17 (PEG), 22.3% (ROE), and a "5 of 9"-style count are all in the message.
    expect(unmatchedNumbers('The PEG is 1.17 and ROE is 22.3%.', given)).toEqual([]);
  });
  it('tolerates a beginner rounding a given figure', () => {
    expect(unmatchedNumbers('ROE is about 22%.', given)).toEqual([]); // given 22.3
  });
  it('flags a fabricated figure', () => {
    expect(unmatchedNumbers('Revenue grew 45% last year.', given)).toContain('45');
  });
  it('matches an unsigned mention of a negative figure', () => {
    // The drawdown is given as a negative percentage; "fell 20%" should match.
    const withDraw = buildUserMessage(context({ drawdown: -0.2 }));
    expect(unmatchedNumbers('It has fallen 20% from its high.', withDraw)).toEqual([]);
  });
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

describe('one language per call', () => {
  it('asks for English prose when the reader is reading English', () => {
    const prompt = systemPromptFor('en');

    expect(prompt).toContain('Write in English');
    expect(prompt).not.toMatch(/dutch/i);
  });

  /**
   * The point of a separate call: the Dutch is written as Dutch from the
   * figures, never rendered from an English summary generated alongside it.
   */
  it('asks for Dutch written as Dutch, not translated', () => {
    const prompt = systemPromptFor('nl');

    expect(prompt).toContain('Write in Dutch');
    expect(prompt).toMatch(/not.*translation/i);
    expect(prompt).toContain('directly in Dutch');
  });

  it('never asks for both languages, or for a JSON envelope', () => {
    for (const lang of ['en', 'nl'] as const) {
      const prompt = systemPromptFor(lang);
      // The envelope that used to truncate: a shape with both languages in it.
      expect(prompt).not.toContain('{"en"');
      expect(prompt).not.toMatch(/respond with (valid )?json/i);
      expect(prompt).not.toMatch(/matching exactly this shape/i);
      // It may mention JSON, but only to forbid it.
      expect(prompt).toMatch(/no JSON/i);
    }
  });

  it('forbids markdown, which the card would render literally', () => {
    // The model reaches for "**Bull case:**" unless told not to, and the card
    // renders plain text, so the asterisks would show.
    expect(systemPromptFor('en')).toMatch(/no asterisks/i);
  });

  it('hands the provider the language prompt and a real token ceiling', async () => {
    await run('nl');

    expect(fake.lastRequest?.systemPrompt).toBe(systemPromptFor('nl'));
    // The old ceiling of 600 had to cover both languages plus an envelope.
    expect(fake.lastRequest?.maxOutputTokens ?? 0).toBeGreaterThan(600);
  });
});

describe('streaming', () => {
  it('yields the text as it arrives', async () => {
    const { deltas } = await run();

    expect(deltas).toEqual(['The bull case ', 'is strong.']);
  });

  it('returns the assembled summary with what it cost', async () => {
    const { result } = await run('nl');

    expect(result.text).toBe('The bull case is strong.');
    expect(result.lang).toBe('nl');
    expect(result.model).toBe('fake-model');
    expect(result.inputTokens).toBe(111);
    expect(result.outputTokens).toBe(222);
  });
});

describe('failures carry a code, never the provider wording', () => {
  it('raises `truncated` when the reply hit the ceiling', async () => {
    fake.truncated = true;

    await expect(run()).rejects.toMatchObject({ code: 'truncated' });
  });

  it('raises `no_text` when nothing came back', async () => {
    fake.deltas = [];

    await expect(run()).rejects.toMatchObject({ code: 'no_text' });
  });

  it('raises `api` for a provider error, keeping its wording off the page', async () => {
    fake.throws = new ThesisProviderError('Gemini API error 429: rate limit exceeded', 429);

    const error = await run().catch((e) => e);

    expect(error).toBeInstanceOf(ThesisError);
    expect(error.code).toBe('api');
    // The detail exists for the log; the code is what the UI is given.
    expect(error.detail).toContain('rate limit exceeded');
  });

  it('names no environment variable in anything it raises', async () => {
    fake.configured = false;

    const error = await run().catch((e) => e);

    expect(error.message).not.toMatch(/GEMINI_API_KEY|ANTHROPIC/);
  });
});

describe('without a configured provider', () => {
  it('reports the feature as unconfigured, so the block can be hidden', () => {
    fake.configured = false;

    expect(thesisEnabled()).toBe(false);
  });

  it('reports it as configured once the provider has a key', () => {
    fake.configured = true;

    expect(thesisEnabled()).toBe(true);
  });

  /**
   * The old behaviour returned placeholder prose flagged `is_mock`, which the
   * page then rendered as a summary. Refusing outright is what stops a
   * placeholder ever reaching the database.
   */
  it('generates nothing rather than a placeholder', async () => {
    fake.configured = false;

    const error = await run().catch((e) => e);

    expect(error).toBeInstanceOf(ThesisError);
    expect(error.code).toBe('disabled');
  });

  it('never produces text a reader could mistake for an analysis', async () => {
    fake.configured = false;

    const error = await run().catch((e) => e);

    expect(error.message).not.toMatch(/Placeholder|Voorbeeldtekst/);
  });
});
