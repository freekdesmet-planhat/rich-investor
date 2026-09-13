'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { generateThesisAction, type ThesisState } from '@/app/stock/[symbol]/thesisActions';

export interface ThesisLabels {
  title: string;
  intro: string;
  generate: string;
  refresh: string;
  generating: string;
  empty: string;
  mockNotice: string;
  staleNotice: string;
  generatedAt: string;
  error: string;
  signedOut: string;
  langMismatch: string | null;
}

/**
 * Skeleton shown while the request is in flight.
 *
 * The call takes a couple of seconds, which is long enough that a frozen button
 * reads as a broken one.
 */
function ThesisSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {['w-full', 'w-11/12', 'w-full', 'w-4/5'].map((width, i) => (
        <div
          key={i}
          className={`h-3 animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${width}`}
        />
      ))}
    </div>
  );
}

function Body({
  thesis,
  labels,
  isMock,
  isStale,
  generatedAt,
}: {
  thesis: string | null;
  labels: ThesisLabels;
  isMock: boolean;
  isStale: boolean;
  generatedAt: string | null;
}) {
  const { pending } = useFormStatus();

  if (pending) return <ThesisSkeleton />;

  if (!thesis) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">{labels.empty}</p>;
  }

  return (
    <>
      {isMock && (
        <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {labels.mockNotice}
        </p>
      )}
      {isStale && !isMock && (
        <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{labels.staleNotice}</p>
      )}
      {/* The thesis is stored in the language it was generated in, so reading
          it in the other one has to be visible rather than silently odd. */}
      {labels.langMismatch && !isMock && (
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{labels.langMismatch}</p>
      )}
      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        {thesis}
      </p>
      {generatedAt && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {labels.generatedAt.replace('{date}', generatedAt.slice(0, 10))}
        </p>
      )}
    </>
  );
}

function GenerateButton({ hasThesis, labels }: { hasThesis: boolean; labels: ThesisLabels }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {pending ? labels.generating : hasThesis ? labels.refresh : labels.generate}
    </button>
  );
}

/**
 * The AI thesis card, beside the qualitative review.
 *
 * Generation is a deliberate click rather than something the page does on load:
 * a summary per visit would be a bill per visit, and the stored one is good
 * until the signal moves.
 */
export function AiThesisCard({
  symbol,
  lang,
  thesis,
  isMock,
  isStale,
  generatedAt,
  canGenerate,
  labels,
}: {
  symbol: string;
  lang: string;
  thesis: string | null;
  isMock: boolean;
  isStale: boolean;
  generatedAt: string | null;
  canGenerate: boolean;
  labels: ThesisLabels;
}) {
  const [state, action] = useActionState<ThesisState, FormData>(generateThesisAction, {
    status: 'idle',
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">{labels.title}</h2>
      <p className="mb-3 mt-1 text-xs text-slate-500 dark:text-slate-400">{labels.intro}</p>

      <form action={action}>
        <input type="hidden" name="symbol" value={symbol} />
        <input type="hidden" name="lang" value={lang} />

        <Body
          thesis={thesis}
          labels={labels}
          isMock={isMock}
          isStale={isStale}
          generatedAt={generatedAt}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canGenerate ? (
            <GenerateButton hasThesis={Boolean(thesis)} labels={labels} />
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">{labels.signedOut}</p>
          )}
          {state.status === 'error' && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {labels.error} {state.message}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
