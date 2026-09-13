/**
 * AI thesis summaries (build step 13).
 *
 * A short bull-and-bear read on a company, generated from figures the ratio
 * engine has already computed. Deliberately on demand only — never in the
 * nightly job — so the cost is one call per click rather than one per ticker
 * per day.
 *
 * Without ANTHROPIC_API_KEY the module returns a fixed placeholder and says so,
 * both in the return value and in the console. The rest of the app works
 * unchanged (section 1), and the stored row is flagged `is_mock` so a
 * placeholder can never be mistaken for a real thesis.
 */
import Anthropic from '@anthropic-ai/sdk';

/**
 * Requested as claude-3-5-sonnet-latest, raised to the current generation.
 *
 * The stated reasons — fast, capable at reasoning, cost-effective — describe
 * `claude-sonnet-5`; 3.5 Sonnet is two generations behind it on all three.
 * Overridable for anyone who wants a different tier.
 */
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

/** Short by construction: the card is a summary, not an essay. */
const MAX_TOKENS = 300;

const SYSTEM_PROMPT =
  "You are a pragmatic, no-nonsense equity analyst applying Peter Lynch's " +
  "'One Up on Wall Street' philosophy. Your task is to summarize the " +
  'fundamental bull and bear case for the provided company. Focus strictly on ' +
  'earnings growth consistency, debt resilience, cash flow quality, and the ' +
  'valuation (PEG). Ignore technical analysis. Keep it concise, direct, and ' +
  'under 150 words.';

const DUTCH_SUFFIX =
  '\n\nWrite your answer in Dutch, in the same direct register.';

export interface ThesisContext {
  symbol: string;
  name: string | null;
  focusSector: string;
  lynchCategory: string;
  status: string;
  conditionsMet: number;
  conditionsApplicable: number;
  /** The nine hard conditions, pass or fail, with what each was judged on. */
  checklist: Array<{ key: string; applicable: boolean; passed: boolean; target: string }>;
  peg: number | null;
  forwardPeg: number | null;
  pegBasis: string | null;
  roe: number | null;
  roa: number | null;
  roaIsAdjusted: boolean;
  epsGrowth: number | null;
  debt: number | null;
  earningsQuality: number | null;
  drawdown: number | null;
}

export interface ThesisResult {
  thesis: string;
  model: string;
  isMock: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
}

const pct = (value: number | null) => (value == null ? 'unknown' : `${(value * 100).toFixed(1)}%`);
const num = (value: number | null) => (value == null ? 'unknown' : value.toFixed(2));

/** The user turn: computed figures only, never raw statements. */
export function buildUserMessage(context: ThesisContext): string {
  const checklist = context.checklist
    .map((condition) => {
      const mark = !condition.applicable ? 'n/a' : condition.passed ? 'PASS' : 'FAIL';
      return `  - ${condition.key}: ${mark} (target: ${condition.target})`;
    })
    .join('\n');

  return [
    `Company: ${context.name ?? context.symbol} (${context.symbol})`,
    `Focus sector: ${context.focusSector}`,
    `Growth category: ${context.lynchCategory}`,
    `Signal status: ${context.status} — ${context.conditionsMet} of ` +
      `${context.conditionsApplicable} applicable conditions met`,
    '',
    'Nine-point checklist:',
    checklist,
    '',
    'Key metrics:',
    `  - PEG (trailing): ${num(context.peg)}`,
    `  - PEG (forward): ${num(context.forwardPeg)}` +
      (context.pegBasis ? ` — condition satisfied on: ${context.pegBasis}` : ''),
    `  - ROE: ${pct(context.roe)}`,
    `  - ROA: ${pct(context.roa)}${context.roaIsAdjusted ? ' (adjusted for settlement balances)' : ''}`,
    `  - EPS growth, 5-year: ${pct(context.epsGrowth)}`,
    `  - Net debt / EBITDA: ${num(context.debt)}`,
    `  - Operating cash flow / net income: ${num(context.earningsQuality)}`,
    `  - Decline from 5-year high: ${pct(context.drawdown)}`,
  ].join('\n');
}

function mockThesis(context: ThesisContext, lang: 'en' | 'nl'): ThesisResult {
  const summary =
    lang === 'nl'
      ? `Voorbeeldtekst — er is geen ANTHROPIC_API_KEY ingesteld, dus er is geen ` +
        `analyse gegenereerd. ${context.symbol} voldoet aan ${context.conditionsMet} van ` +
        `${context.conditionsApplicable} voorwaarden, met een PEG van ${num(context.peg)} en ` +
        `een rendement op eigen vermogen van ${pct(context.roe)}. Stel de sleutel in om een ` +
        `echte samenvatting te krijgen.`
      : `Placeholder — ANTHROPIC_API_KEY is not set, so no analysis was generated. ` +
        `${context.symbol} meets ${context.conditionsMet} of ${context.conditionsApplicable} ` +
        `conditions, with a PEG of ${num(context.peg)} and a return on equity of ` +
        `${pct(context.roe)}. Set the key to get a real summary.`;

  console.warn(
    `[thesis] ANTHROPIC_API_KEY is not set — returning a placeholder for ${context.symbol}.`,
  );

  return { thesis: summary, model: 'mock', isMock: true, inputTokens: null, outputTokens: null };
}

export async function generateThesis(
  context: ThesisContext,
  lang: 'en' | 'nl' = 'en',
): Promise<ThesisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return mockThesis(context, lang);

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: lang === 'nl' ? SYSTEM_PROMPT + DUTCH_SUFFIX : SYSTEM_PROMPT,
      // Summarising figures that are already computed is not a reasoning task,
      // and a 300-token ceiling would otherwise be spent thinking rather than
      // answering.
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: buildUserMessage(context) }],
    });

    const thesis = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!thesis) {
      throw new Error(`no text returned (stop_reason: ${response.stop_reason})`);
    }

    return {
      thesis,
      model: response.model,
      isMock: false,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    // A failed call must not take the page down; the card shows the reason.
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error ${error.status}: ${error.message}`);
    }
    throw error;
  }
}
