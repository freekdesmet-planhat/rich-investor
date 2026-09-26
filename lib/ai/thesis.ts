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
import { formatNumber, formatPercent } from '@/lib/i18n/format';
import { CONDITION_LABEL } from '@/lib/signal/explain';
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
  // A whole number with at most one decimal group, whose separator may be a dot
  // (English) or a comma (Dutch: "148,8%"). The thesis figures carry no thousands
  // separators, so a single "," or "." is always the decimal point.
  for (const match of text.matchAll(/-?\d+(?:[.,]\d+)?/g)) {
    const raw = match[0];
    const value = Math.abs(Number(raw.replace(',', '.')));
    if (!Number.isFinite(value)) continue;
    const sep = raw.search(/[.,]/);
    out.push({ value, decimals: sep === -1 ? 0 : raw.length - sep - 1 });
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
  '- For valuation, do not call the price cheap or expensive as an opinion. Name the ' +
  'specific rule the company meets or misses, and state it in the active voice — ' +
  '"the method asks for a fall of at least 50%", not "a fall of 50% was sought".\n' +
  '- Name the checks the app’s own way: call them "conditions", and refer to each by ' +
  'the name given in the checklist below. Do not call them "criteria", "rules", ' +
  '"norms", "requirements" or "limits". It is the stock — the company — that meets or ' +
  'misses conditions, never "the price".\n' +
  '- Do not judge a figure with a bare opinion word ("very low", "high", "strong"). ' +
  'State it against the method’s limit instead — for example "well below the limit of ' +
  '2.5", not "very low at 0.27".\n' +
  '- Every number you write must be one of the figures listed below, copied exactly ' +
  'as written there: the same digits, the same decimal mark, and with the % sign — ' +
  'do not spell out "per cent" or "procent", and do not invent, round or recompute a ' +
  'figure.';

/**
 * Appended when ROE is above 100%, so the summary explains the figure rather than
 * letting a beginner read "148.8%" as a profit margin (A7 follow-up).
 */
const ROE_NOTE_INSTRUCTION =
  'This company’s return on equity is above 100%. Explain, in plain words, that ' +
  'this is unusually high because the company has bought back so many of its own ' +
  'shares that its equity is small, and that return on assets is the steadier measure ' +
  'here. Do not present the return on equity as a profit margin.';

/**
 * Appended when the price is within 1% of its five-year high, so the summary says
 * so plainly instead of citing an awkward "0.0% decline" (A7 follow-up).
 */
const AT_HIGH_INSTRUCTION =
  'The share price is at (or within 1% of) its five-year high. Say plainly that the ' +
  'stock is at its five-year high, rather than citing a decline of about 0%.';

const FORMAT_INSTRUCTIONS =
  'Reply with the summary itself and nothing else: no preamble, no heading, no ' +
  'bullet list, no JSON. Write plain prose — the page renders the reply as text, ' +
  'so any markdown appears literally: no asterisks, no bold, no "Bull case:" ' +
  'labels. Two short paragraphs at most, under 150 words in total.';

/** The system turn for one language. Dutch is written as Dutch, not translated. */
export function systemPromptFor(
  lang: Lang,
  opts: { roeAboveHundred?: boolean; atFiveYearHigh?: boolean } = {},
): string {
  const language =
    lang === 'nl'
      ? 'Write in Dutch, as a Dutch financial journalist would write for a Dutch ' +
        'private investor. Use the ordinary Dutch terms for these concepts, written ' +
        'naturally — for example "nettoschuld" as one word. Call the conditions ' +
        '"voorwaarden" (singular "voorwaarde"), not "criteria", "regel", "norm" or ' +
        '"grens". Do not write English and do not produce a word-for-word translation ' +
        'of an English sentence — write the analysis directly in Dutch.'
      : 'Write in English, for a private investor.';

  let constraints = CONSTRAINTS;
  if (opts.roeAboveHundred) constraints += `\n- ${ROE_NOTE_INSTRUCTION}`;
  if (opts.atFiveYearHigh) constraints += `\n- ${AT_HIGH_INSTRUCTION}`;

  return `${SHARED_INSTRUCTIONS}\n\n${language}\n\n${constraints}\n\n${FORMAT_INSTRUCTIONS}`;
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

/**
 * The user turn: computed figures only, never raw statements — and each figure
 * formatted in the reader's language (a Dutch summary must read "13,2%", not
 * "13.2 procent"). The model is told to copy these strings verbatim, and the
 * numbers check validates against this same text, so the two cannot drift.
 */
export function buildUserMessage(context: ThesisContext, lang: Lang = 'en'): string {
  const pct = (value: number | null) => (value == null ? 'unknown' : formatPercent(value, lang, 1));
  const num = (value: number | null) => (value == null ? 'unknown' : formatNumber(value, lang, 2));
  const checklist = context.checklist
    .map((condition) => {
      const mark = !condition.applicable ? 'n/a' : condition.passed ? 'PASS' : 'FAIL';
      // The app's own name for the condition, so the summary reuses the reader's
      // vocabulary rather than inventing "criteria" or "norms" (launch item 7).
      const name = CONDITION_LABEL[condition.key]?.[lang] ?? condition.key;
      return `  - ${name}: ${mark} (target: ${condition.target})`;
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
    systemPrompt: systemPromptFor(lang, {
      roeAboveHundred: context.roe != null && context.roe > 1,
      atFiveYearHigh: context.drawdown != null && Math.abs(context.drawdown) < 0.01,
    }),
    userMessage: buildUserMessage(context, lang),
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
  const invented = unmatchedNumbers(trimmed, buildUserMessage(context, lang));
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
