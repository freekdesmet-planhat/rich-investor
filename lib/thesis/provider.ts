/**
 * The model provider, behind one small interface.
 *
 * Everything else in the app talks to `ThesisProvider` and knows nothing about
 * which vendor is behind it: the route, the thesis module and the tests all use
 * the same three members. Swapping vendor again means rewriting this file and
 * nothing else.
 *
 * Deliberately thin. There is no registry, no plugin loading and no runtime
 * selection — one provider is configured at a time, and `thesisProvider()`
 * returns it.
 *
 * The provider knows nothing about theses, languages or the checklist. It is
 * handed a system prompt and a user message and streams text back, so the
 * prompt-building and the failure vocabulary stay in `lib/ai/thesis.ts` where
 * they belong.
 */
import { GoogleGenAI, ApiError, FinishReason, ThinkingLevel } from '@google/genai';

/**
 * The model, in one place.
 *
 * Overridable per deployment without a code change. Read per call rather than
 * captured at module scope so setting it does not need a rebuild.
 */
export const DEFAULT_THESIS_MODEL = 'gemini-3.6-flash';

export function thesisModel(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_THESIS_MODEL;
}

export interface ThesisProviderRequest {
  systemPrompt: string;
  userMessage: string;
  /** The provider's own ceiling — `maxOutputTokens` for Gemini. */
  maxOutputTokens: number;
  /** Aborts the upstream call when the caller goes away. */
  signal?: AbortSignal;
}

export interface ThesisProviderResult {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** True when generation stopped at the ceiling rather than finishing. */
  truncated: boolean;
}

/** Raised for a transport or API failure. The wording is for the log only. */
export class ThesisProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ThesisProviderError';
  }
}

export interface ThesisProvider {
  /** The model that will answer, for storing alongside the result. */
  readonly model: string;
  /** False when no API key is configured, so the caller can hide the feature. */
  isConfigured(): boolean;
  /** Streams the reply, returning what it cost once it is complete. */
  stream(request: ThesisProviderRequest): AsyncGenerator<string, ThesisProviderResult>;
}

class GeminiProvider implements ThesisProvider {
  get model(): string {
    return thesisModel();
  }

  isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }

  async *stream(request: ThesisProviderRequest): AsyncGenerator<string, ThesisProviderResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new ThesisProviderError('GEMINI_API_KEY is not set');

    const client = new GoogleGenAI({ apiKey });
    const model = this.model;

    let truncated = false;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    try {
      const stream = await client.models.generateContentStream({
        model,
        contents: request.userMessage,
        config: {
          systemInstruction: request.systemPrompt,
          maxOutputTokens: request.maxOutputTokens,
          abortSignal: request.signal,
          // Thinking shares the output budget on this model family, and it is
          // not free: left to its default, a 150-word summary spent ~700 tokens
          // reasoning and ~180 answering, so the ceiling was mostly consumed
          // before a word was written — the same squeeze that made the previous
          // implementation truncate. Summarising figures the ratio engine has
          // already computed is not a reasoning task, so the budget goes to the
          // summary. (`thinkingBudget: 0` is rejected by this model; the level
          // is the supported control.)
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      for await (const chunk of stream) {
        // Usage arrives progressively; the last chunk carries the totals.
        if (chunk.usageMetadata) {
          inputTokens = chunk.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens;
        }
        const finish = chunk.candidates?.[0]?.finishReason;
        if (finish === FinishReason.MAX_TOKENS) truncated = true;

        const text = chunk.text;
        if (text) yield text;
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw new ThesisProviderError(`Gemini API error ${error.status}: ${error.message}`, error.status);
      }
      throw error;
    }

    return { model, inputTokens, outputTokens, truncated };
  }
}

/** The configured provider. One vendor at a time, chosen here. */
export function thesisProvider(): ThesisProvider {
  return new GeminiProvider();
}
