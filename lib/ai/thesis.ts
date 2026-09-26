/**
 * AI thesis summaries (build step 13).
 *
 * A short bull-and-bear read on a company, generated from figures the ratio
 * engine has already computed. Deliberately on demand only — never in the
 * nightly job — so the cost is one call per click rather than one per ticker
 * per day.
 *
 * One language per call. Asking for English and Dutch in a single JSON reply
 * was the whole of BUG-01: the two summaries plus the envelope did not fit in
 * the token ceiling, the reply came back truncated, the JSON failed to parse
 * and every generation failed. Each language is now its own request, written in
 * that language from the figures — the Dutch is never a translation of a cached
 * English one, which is also what section 2 asks for.
 *
 * The reply is prose rather than JSON. With one language there is nothing to
 * disambiguate, so the envelope that used to truncate is simply gone, and a
 * reply that runs long is short prose instead of an unparseable fragment.
 *
 * Without GEMINI_API_KEY there is no placeholder and no stored row: the
 * caller asks `thesisEnabled()` first and hides the block entirely. A
 * placeholder that reads like an analysis is worse than no analysis.
 */
import type { Lang } from '@/lib/i18n/config';
import {
  thesisProvider,
  ThesisProviderError,
  type ThesisProviderResult,
} from '@/lib/thesis/provider';

/**
 * Why a generation failed, as a code the UI can translate.
 *
 * The provider's own message is English and written for a developer; showing it
 * to a Dutch reader put untranslated text on the page (and told them which
 * environment variable was missing). The code travels instead, and each
 * language supplies its own sentence under `thesis.failed`.
 */
export type ThesisErrorCode = 'truncated' | 'no_text' | 'api' | 'disabled' | 'numbers';

interface NumberToken {
  value: number;
  decimals: number;
}

function numberTokens(text: string): NumberToken[] {
  const out: NumberToken[] = [];
  for (const match of text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)) {
    const raw = match[0].replace(/,/g, '');
    const value = Math.abs(Number(raw));
    if (!Number.isFinite(value)) continue;
    const dot = raw.indexOf('.');
    out.push({ value, decimals: dot === -1 ? 0 : raw.length - dot - 1 });
  }
  return out;
}

/**
 * Numbers in the output that were not among the figures the model was given.
 *
 * The guardrail: a beginner summary must not contain a figure we did not hand it,
 * because an invented number reads as fact. `allowedText` is the exact user message
 * (targets, the "N of M" count and every metric value), so a number counts as
 * given when some allowed value rounds to it at the precision the model wrote —
 * "15%" is fine against a given 15.0, "1.2" against 1.23, but an invented 45 is not.
 * Values are compared unsigned, so "fell 30%" matches a −30.0% drawdown.
 */
export function unmatchedNumbers(output: string, allowedText: string): string[] {
  const allowed = numberTokens(allowedText).map((t) => t.value);
  const round = (v: number, d: number) => Number(v.toFixed(d));
  const bad: string[] = [];
  for (const token of numberTokens(output)) {
    const ok = allowed.some((a) => Math.abs(round(a, token.decimals) - token.value) < 1e-9);
    if (!ok) bad.push(token.decimals === 0 ? String(token.value) : token.value.toFixed(token.decimals));
  }
  return bad;
}

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
 * Room for one summary, with headroom.
 *
 * The system prompt caps a summary at 150 words, which is about 250 tokens of
 * English and somewhat more of Dutch. 1200 leaves room for a long Dutch reply
 * to finish its last sentence rather than stopping mid-clause — the old 600 had
 * to cover *both* languages plus a JSON envelope, which is what it kept failing
 * to do.
 */
const MAX_TOKENS = 1200;

const SHARED_INSTRUCTIONS =
  'You explain, in plain language for someone new to investing, what a company’s ' +
  'figures show: how steadily its earnings have grown, how much debt it carries, ' +
  'whether its cash flow backs up its reported profit, and whether the price looks ' +
  'reasonable against its growth (the PEG). Balance the strengths against the ' +
  'weaknesses. Ignore chart patterns and technical analysis.';

/**
 * The hard constraints, in the prompt as well as enforced in code (numbers) — the
 * summary is shown to beginners and must not read as a recommendation.
 */
const CONSTRAINTS =
  'Rules you must follow:\n' +
  '- Use plain words a beginner understands; explain a term the first time you use it.\n' +
  '- Do not name investors or investing styles, and do not describe the company as ' +
  'fitting any named investor’s profile.\n' +
  '- No superlatives or salesy words (no "fortress", "dirt-cheap", "best-in-class").\n' +
  '- Do not tell the reader to buy, sell, hold or wait, and give no price targets or ' +
  'price predictions.\n' +
  '- Every number you write must be one of the figures given below, exactly as given. ' +
  'Do not invent numbers, round them differently, or calculate new ones.';

const FORMAT_INSTRUCTIONS =
  'Reply with the summary itself and nothing else: no preamble, no heading, no ' +
  'bullet list, no JSON. Write plain prose — the page renders the reply as text, ' +
  'so any markdown appears literally: no asterisks, no bold, no "Bull case:" ' +
  'labels. Two short paragraphs at most, under 150 words in total.';

/** The system turn for one language. Dutch is written as Dutch, not translated. */
export function systemPromptFor(lang: Lang): string {
  const language =
    lang === 'nl'
      ? 'Write in Dutch, as a Dutch financial journalist would write for a Dutch ' +
        'private investor. Use the ordinary Dutch terms for these concepts. Do not ' +
        'write English and do not produce a word-for-word translation of an English ' +
        'sentence — write the analysis directly in Dutch.'
      : 'Write in English, for a private investor.';

  return `${SHARED_INSTRUCTIONS}\n\n${language}\n\n${CONSTRAINTS}\n\n${FORMAT_INSTRUCTIONS}`;
}

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

/** What a completed generation produced, once the stream has finished. */
export interface ThesisResult {
  text: string;
  lang: Lang;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

/**
 * Whether the feature is configured at all.
 *
 * The page asks this before rendering anything: with no key the AI block is
 * absent rather than explaining its own absence to a reader who cannot act on
 * it. Read per call rather than at module scope so a deployment that sets the
 * key does not need a rebuild to pick it up.
 */
export function thesisEnabled(): boolean {
  return thesisProvider().isConfigured();
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
 * Streams one summary, in one language.
 *
 * Yields text as it arrives so the card fills in rather than sitting on a dead
 * button for several seconds, and returns what the caller needs to store once
 * the reply is complete. Nothing is persisted here — the caller decides, and
 * only ever after a clean finish.
 */
export async function* streamThesis(
  context: ThesisContext,
  lang: Lang,
  signal?: AbortSignal,
): AsyncGenerator<string, ThesisResult> {
  const provider = thesisProvider();

  // Unreachable through the UI, which hides the block when the provider is not
  // configured. Still a code rather than a crash, so a stray request fails the
  // same way as any other failure — and names no environment variable.
  if (!provider.isConfigured()) {
    throw new ThesisError('disabled', 'no provider API key is configured');
  }

  const generation = provider.stream({
    systemPrompt: systemPromptFor(lang),
    userMessage: buildUserMessage(context),
    maxOutputTokens: MAX_TOKENS,
    signal,
  });

  let text = '';
  let outcome: ThesisProviderResult;

  try {
    // Driven by hand rather than `for await`, which discards the return value —
    // and the return value is what says whether the reply actually finished.
    let step = await generation.next();
    while (!step.done) {
      text += step.value;
      yield step.value;
      step = await generation.next();
    }
    outcome = step.value;
  } catch (error) {
    if (error instanceof ThesisProviderError) {
      throw new ThesisError('api', error.message);
    }
    throw error;
  }

  const trimmed = text.trim();
  if (!trimmed) throw new ThesisError('no_text', `model: ${outcome.model}`);

  // A summary that stopped at the ceiling ends mid-sentence. Storing it would
  // put a half-written analysis on the page as though it were finished.
  if (outcome.truncated) {
    throw new ThesisError('truncated', `hit maxOutputTokens (${MAX_TOKENS})`);
  }

  // Every number in the summary must be one we handed the model. A stray figure
  // is a fabrication to a beginner; the caller retries once, then shows nothing.
  const invented = unmatchedNumbers(trimmed, buildUserMessage(context));
  if (invented.length > 0) {
    throw new ThesisError('numbers', `invented figures: ${invented.join(', ')}`);
  }

  return {
    text: trimmed,
    lang,
    model: outcome.model,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
  };
}
