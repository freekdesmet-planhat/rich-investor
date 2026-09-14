/**
 * AI thesis summaries (build step 13).
 *
 * A short bull-and-bear read on a company, generated from figures the ratio
 * engine has already computed. Deliberately on demand only — never in the
 * nightly job — so the cost is one call per click rather than one per ticker
 * per day.
 *
 * Both languages come from a single call and are stored together (section 2):
 * generated content must never exist in one language without the other, and
 * asking twice would double the cost for the same analysis.
 *
 * Without ANTHROPIC_API_KEY the module returns a fixed placeholder and says so,
 * both in the return value and in the console. The rest of the app works
 * unchanged, and the stored row is flagged `is_mock` so a placeholder can never
 * be mistaken for a real thesis.
 */
import Anthropic from '@anthropic-ai/sdk';

/**
 * Why a generation failed, as a code the UI can translate.
 *
 * The provider's own message is English and written for a developer; showing it
 * to a Dutch reader put untranslated text on the page (and told them which
 * environment variable was missing). The code travels instead, and each
 * language supplies its own sentence under `thesis.failed`.
 */
export type ThesisErrorCode = 'truncated' | 'bad_json' | 'no_text' | 'api';

export class ThesisError extends Error {
  constructor(
    readonly code: ThesisErrorCode,
    /** The provider's wording, for the server log — never for the page. */
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ThesisError';
  }
}

/**
 * Requested as claude-3-5-sonnet-latest, raised to the current generation.
 *
 * The stated reasons — fast, capable at reasoning, cost-effective — describe
 * `claude-sonnet-5`; 3.5 Sonnet is two generations behind it on all three.
 * Overridable for anyone who wants a different tier.
 */
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

/**
 * Room for two summaries plus the JSON envelope.
 *
 * Each language is capped at 150 words by the system prompt; 600 tokens leaves
 * headroom so neither is truncated mid-sentence, which would be worse than
 * either being shorter.
 */
const MAX_TOKENS = 600;

const SYSTEM_PROMPT =
  "You are a pragmatic, no-nonsense equity analyst applying Peter Lynch's " +
  "'One Up on Wall Street' philosophy. Your task is to summarize the " +
  'fundamental bull and bear case for the provided company. Focus strictly on ' +
  'earnings growth consistency, debt resilience, cash flow quality, and the ' +
  'valuation (PEG). Ignore technical analysis. Keep it concise, direct, and ' +
  'under 150 words per language.\n\n' +
  'Respond with valid JSON only, matching exactly this shape:\n' +
  '{"en": "<the summary in English>", "nl": "<the same summary in Dutch>"}\n\n' +
  'The Dutch is a natural rendering for a Dutch investor, not a literal ' +
  'translation, and must make the same points as the English. Output no prose ' +
  'outside the JSON object and no code fences.';

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
  en: string;
  nl: string;
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

/**
 * Pulls `{en, nl}` out of the model's reply.
 *
 * The prompt asks for bare JSON, but a stray code fence or a sentence before
 * the object is the classic failure mode, so the first balanced object in the
 * text is used rather than assuming the whole reply parses. Returns null when
 * nothing usable is found, and the caller decides what to do about it.
 */
export function parseThesisJson(raw: string): { en: string; nl: string } | null {
  const withoutFence = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const candidates = [withoutFence];
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(withoutFence.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { en?: unknown; nl?: unknown };
      const en = typeof parsed.en === 'string' ? parsed.en.trim() : '';
      const nl = typeof parsed.nl === 'string' ? parsed.nl.trim() : '';
      // Both must be present: half a bilingual summary is not a summary.
      if (en && nl) return { en, nl };
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function mockThesis(context: ThesisContext): ThesisResult {
  const shared = `${context.symbol}`;
  console.warn(
    `[thesis] ANTHROPIC_API_KEY is not set — returning a placeholder for ${shared}.`,
  );

  return {
    en:
      `Placeholder — ANTHROPIC_API_KEY is not set, so no analysis was generated. ` +
      `${context.symbol} meets ${context.conditionsMet} of ${context.conditionsApplicable} ` +
      `conditions, with a PEG of ${num(context.peg)} and a return on equity of ` +
      `${pct(context.roe)}. Set the key to get a real summary.`,
    nl:
      `Voorbeeldtekst — er is geen ANTHROPIC_API_KEY ingesteld, dus er is geen analyse ` +
      `gegenereerd. ${context.symbol} voldoet aan ${context.conditionsMet} van ` +
      `${context.conditionsApplicable} voorwaarden, met een PEG van ${num(context.peg)} en ` +
      `een rendement op eigen vermogen van ${pct(context.roe)}. Stel de sleutel in om een ` +
      `echte samenvatting te krijgen.`,
    model: 'mock',
    isMock: true,
    inputTokens: null,
    outputTokens: null,
  };
}

export async function generateThesis(context: ThesisContext): Promise<ThesisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return mockThesis(context);

  const client = new Anthropic({ apiKey });

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      // Summarising figures that are already computed is not a reasoning task,
      // and the token budget is better spent on the two summaries themselves.
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: buildUserMessage(context) }],
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new ThesisError('api', `Anthropic API error ${error.status}: ${error.message}`);
    }
    throw error;
  }

  const raw = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!raw) throw new ThesisError('no_text', `stop_reason: ${response.stop_reason}`);

  const parsed = parseThesisJson(raw);
  if (!parsed) {
    // Truncation is the likeliest cause, and it is worth naming: a silent
    // half-summary would be stored as though it were complete.
    throw response.stop_reason === 'max_tokens'
      ? new ThesisError('truncated', 'reply cut off before both languages were complete')
      : new ThesisError('bad_json', 'reply was not the requested {en, nl} JSON');
  }

  return {
    ...parsed,
    model: response.model,
    isMock: false,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
