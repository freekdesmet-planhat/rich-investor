/**
 * AI thesis tests.
 *
 * Two behaviours matter most. Without an API key nothing is generated and
 * nothing is stored — the placeholder that used to be written here is what put
 * "Placeholder — ANTHROPIC_API_KEY is not set" on a stock page as though it were
 * an analysis. And a generation that does not finish cleanly raises a code
 * rather than returning half a summary.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

/** Events and outcome for one fake call, set per test. */
const fake: {
  deltas: string[];
  stopReason: string;
  throws: unknown;
} = { deltas: [], stopReason: 'end_turn', throws: null };

let lastRequest: Record<string, unknown> | null = null;

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }

  class FakeAnthropic {
    static APIError = APIError;

    messages = {
      stream: (request: Record<string, unknown>) => {
        lastRequest = request;
        return {
          async *[Symbol.asyncIterator]() {
            if (fake.throws) throw fake.throws;
            for (const text of fake.deltas) {
              yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
            }
          },
          finalMessage: async () => ({
            stop_reason: fake.stopReason,
            model: 'claude-sonnet-5',
            usage: { input_tokens: 111, output_tokens: 222 },
          }),
        };
      },
    };
  }

  return { default: FakeAnthropic };
});

const {
  buildUserMessage,
  streamThesis,
  systemPromptFor,
  thesisEnabled,
  ThesisError,
}: typeof import('./thesis') = await import('./thesis');
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

/** Drains the generator, returning the deltas and the final result. */
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

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
  fake.deltas = ['The bull case ', 'is strong.'];
  fake.stopReason = 'end_turn';
  fake.throws = null;
  lastRequest = null;
});

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

  it('never asks for both languages, or for JSON', () => {
    for (const lang of ['en', 'nl'] as const) {
      const prompt = systemPromptFor(lang);
      expect(prompt).not.toContain('{"en"');
      expect(prompt).not.toMatch(/\bJSON\b(?!,)/);
    }
  });

  it('sends the language-specific system prompt and a real token ceiling', async () => {
    await run('nl');

    expect(lastRequest?.system).toBe(systemPromptFor('nl'));
    // The old ceiling of 600 had to cover both languages plus an envelope.
    expect(lastRequest?.max_tokens as number).toBeGreaterThan(600);
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
    expect(result.model).toBe('claude-sonnet-5');
    expect(result.inputTokens).toBe(111);
    expect(result.outputTokens).toBe(222);
  });
});

describe('failures carry a code, never the provider wording', () => {
  it('raises `truncated` when the reply hit the ceiling', async () => {
    fake.stopReason = 'max_tokens';

    await expect(run()).rejects.toMatchObject({ code: 'truncated' });
  });

  it('raises `no_text` when nothing came back', async () => {
    fake.deltas = [];

    await expect(run()).rejects.toMatchObject({ code: 'no_text' });
  });

  it('raises `api` for a provider error, keeping its wording off the page', async () => {
    // The mock's APIError takes (status, message); the real one takes more, and
    // tsc checks against the real signature.
    const ApiError = (await import('@anthropic-ai/sdk')).default
      .APIError as unknown as new (status: number, message: string) => Error;
    fake.throws = new ApiError(429, 'rate limit exceeded');

    const error = await run().catch((e) => e);

    expect(error).toBeInstanceOf(ThesisError);
    expect(error.code).toBe('api');
    // The detail exists for the log; the code is what the UI is given.
    expect(error.detail).toContain('rate limit exceeded');
  });
});

describe('without an API key', () => {
  it('reports the feature as unconfigured, so the block can be hidden', () => {
    delete process.env.ANTHROPIC_API_KEY;

    expect(thesisEnabled()).toBe(false);
  });

  it('reports it as configured once a key is present', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    expect(thesisEnabled()).toBe(true);
  });

  /**
   * The old behaviour returned placeholder prose flagged `is_mock`, which the
   * page then rendered as a summary. Refusing outright is what stops a
   * placeholder ever reaching the database.
   */
  it('generates nothing rather than a placeholder', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const error = await run().catch((e) => e);

    expect(error).toBeInstanceOf(ThesisError);
    expect(error.code).toBe('disabled');
  });

  it('never produces text a reader could mistake for an analysis', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const error = await run().catch((e) => e);

    expect(error.message).not.toMatch(/Placeholder|Voorbeeldtekst/);
  });
});
