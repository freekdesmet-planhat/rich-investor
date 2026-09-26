'use client';

import { useCallback, useRef, useState } from 'react';
import { SectionHeading } from './ui/Surface';

export interface ThesisLabels {
  title: string;
  intro: string;
  generate: string;
  refresh: string;
  generating: string;
  empty: string;
  generatedAt: string;
  /** "Figures as of {date}", shown under the summary. */
  figuresAsOf: string;
  error: string;
  signedOut: string;
  /** One sentence per failure code, from `thesis.failed` in the active language. */
  failed: Record<string, string>;
}

/**
 * Shown only until the first characters arrive.
 *
 * Once the model is writing, the partial text is a better progress indicator
 * than any placeholder, so the skeleton gets out of the way.
 */
function ThesisSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {['w-full', 'w-11/12', 'w-full', 'w-4/5'].map((width, i) => (
        <div
          key={i}
          className={`h-3 animate-pulse rounded bg-line ${width}`}
        />
      ))}
    </div>
  );
}

/**
 * The AI thesis card, beside the human judgement it is not a substitute for.
 *
 * Generation is a deliberate click rather than something the page does on load:
 * a summary per visit would be a bill per visit, and the stored one is good
 * until the signal moves.
 *
 * The text streams in as it is written. The card is only rendered at all when
 * an API key is configured — with no key there is no block here to explain
 * itself, and nothing is ever stored.
 */
export function AiThesisCard({
  symbol,
  lang,
  thesis: cached,
  generatedAt: cachedAt,
  figuresAsOf,
  canGenerate,
  labels,
}: {
  symbol: string;
  lang: string;
  thesis: string | null;
  generatedAt: string | null;
  figuresAsOf: string | null;
  canGenerate: boolean;
  labels: ThesisLabels;
}) {
  const [text, setText] = useState<string | null>(cached);
  const [generatedAt, setGeneratedAt] = useState<string | null>(cachedAt);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setPending(true);
    setErrorCode(null);
    setText(null);

    let streamed = '';
    let failed: string | null = null;

    try {
      const response = await fetch('/api/thesis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ symbol, lang }),
        signal: controller.signal,
      });

      // A refusal (401, 429, 503) answers with a single JSON object rather than
      // the stream, so it is read as JSON before any stream parsing.
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { code?: string } | null;
        failed = payload?.code ?? 'unknown';
      } else if (!response.body) {
        failed = 'unknown';
      } else {
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';

        // Newline-delimited JSON: a chunk may split a line, and may carry more
        // than one, so the buffer is drained a line at a time.
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;

          let newline = buffer.indexOf('\n');
          while (newline !== -1) {
            const raw = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');
            if (!raw) continue;

            const event = JSON.parse(raw) as {
              type: string;
              text?: string;
              code?: string;
              generatedAt?: string;
            };
            if (event.type === 'delta' && event.text) {
              streamed += event.text;
              setText(streamed);
            } else if (event.type === 'done') {
              setGeneratedAt(event.generatedAt ?? null);
            } else if (event.type === 'error') {
              failed = event.code ?? 'unknown';
            }
          }
        }
      }
    } catch (error) {
      // An aborted request is the user's own doing, not a failure to report.
      if ((error as Error).name !== 'AbortError') failed = 'unknown';
    } finally {
      setPending(false);
    }

    if (failed) {
      setErrorCode(failed);
      // A partial reply is not an analysis; the card goes back to whatever was
      // stored rather than keeping half a summary on screen.
      setText(cached);
    }
  }, [symbol, lang, cached]);

  const hasText = Boolean(text && text.length > 0);

  return (
    <section className="bg-surface border-line rounded-lg border p-4">
      <SectionHeading>{labels.title}</SectionHeading>
      <p className="text-ink-subtle mb-3 mt-1 text-xs">{labels.intro}</p>

      {pending && !hasText && <ThesisSkeleton />}

      {!pending && !hasText && (
        <p className="text-ink-subtle text-sm">{labels.empty}</p>
      )}

      {hasText && (
        <>
          <p
            aria-live="polite"
            className="whitespace-pre-line text-sm leading-relaxed text-ink-muted"
          >
            {text}
            {pending && <span className="ml-0.5 animate-pulse">▍</span>}
          </p>
          {!pending && (
            <div className="text-ink-faint mt-2 space-y-0.5 text-xs">
              {figuresAsOf && <p>{labels.figuresAsOf.replace('{date}', figuresAsOf.slice(0, 10))}</p>}
              {generatedAt && <p>{labels.generatedAt.replace('{date}', generatedAt.slice(0, 10))}</p>}
            </div>
          )}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canGenerate ? (
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="border-line-strong text-ink-muted hover:bg-surface-hover rounded-md border px-3 py-1.5 text-sm transition disabled:opacity-60"
          >
            {pending ? labels.generating : cached || hasText ? labels.refresh : labels.generate}
          </button>
        ) : (
          <p className="text-ink-subtle text-xs">{labels.signedOut}</p>
        )}
        {errorCode && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            {labels.error} {labels.failed[errorCode] ?? labels.failed.unknown}
          </p>
        )}
      </div>
    </section>
  );
}
