/**
 * A way out of a skeleton that never resolves.
 *
 * A Suspense fallback has no timeout. If the client takes the boundary over
 * from the streaming runtime and then fails to resolve it — a swallowed
 * hydration error, a client chunk that does not match the payload it is
 * hydrating — the page shows a loading animation for ever, and a permanent
 * failure is indistinguishable from a slow one. That is what makes this class
 * of bug so expensive: nothing is on fire, nothing is logged, the page simply
 * never arrives.
 *
 * Deliberately not React. If React is the thing that is wedged, a client
 * component inside the fallback cannot be relied on to hydrate either — so this
 * is an inline script, plain DOM and a `setTimeout`, which runs as soon as the
 * browser parses it and owes nothing to the framework. It only reveals markup
 * that is already on the page; with JavaScript off the skeleton behaves exactly
 * as it did before.
 *
 * The language is chosen by the same script rather than through next-intl,
 * because a Suspense fallback may not suspend — which rules out the async
 * `getTranslations` every other server component uses. Two short strings.
 */
const COPY = {
  en: {
    message:
      'This is taking longer than it should. The page may have failed to load rather than still be loading.',
    retry: 'Reload the page',
  },
  nl: {
    message:
      'Dit duurt langer dan het hoort. Mogelijk is de pagina niet geladen in plaats van nog aan het laden.',
    retry: 'Pagina opnieuw laden',
  },
} as const;

export function StuckLoadingEscape({
  id,
  after = 15_000,
}: {
  /** Unique per skeleton, so two on one page cannot fight over one element. */
  id: string;
  /**
   * Generous on purpose: this is the "something is wrong" line, not the "this
   * is slow" line, and a cold start on a dynamic page can legitimately take
   * several seconds.
   */
  after?: number;
}) {
  return (
    <div
      id={id}
      hidden
      className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <p data-stuck-message>{COPY.en.message}</p>
      <button
        type="button"
        data-stuck-retry
        className="mt-2 rounded-md border border-amber-400 px-3 py-1.5 font-medium transition hover:bg-amber-100 dark:border-amber-600 dark:hover:bg-amber-900"
      >
        {COPY.en.retry}
      </button>

      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){
var n=document.getElementById(${JSON.stringify(id)});if(!n)return;
var c=${JSON.stringify(COPY)};
if(document.cookie.indexOf('rib-locale=nl')>-1){
  var m=n.querySelector('[data-stuck-message]');if(m)m.textContent=c.nl.message;
  var r=n.querySelector('[data-stuck-retry]');if(r)r.textContent=c.nl.retry;
}
var t=setTimeout(function(){
  // Only if this node is still in the document. When React resolves the
  // boundary the whole fallback is removed, and there is nothing to reveal.
  if(document.body.contains(n))n.hidden=false;
},${after});
var b=n.querySelector('[data-stuck-retry]');
if(b)b.addEventListener('click',function(){location.reload();});
window.addEventListener('pagehide',function(){clearTimeout(t);});
})();`,
        }}
      />
    </div>
  );
}
