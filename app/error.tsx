'use client';

import { useEffect } from 'react';

/**
 * A real error state, so a failure never looks like loading.
 *
 * Before this there was no error boundary anywhere. A page that threw while
 * rendering left whatever was on screen — in practice the loading skeleton —
 * and nothing said otherwise. "Broken" and "still loading" looked identical,
 * which is exactly how a page can hang for a week without anyone being able to
 * say what went wrong.
 *
 * The copy is chosen from the locale cookie rather than through next-intl on
 * purpose: this component runs *because* something in the tree below failed,
 * and depending on the i18n provider here would risk the error page throwing
 * its own error. Two short strings are worth the duplication for that.
 */
const COPY = {
  en: {
    title: 'This page did not load',
    body: 'Something went wrong while rendering it. The data itself is fine — reloading usually fixes it.',
    retry: 'Try again',
    home: 'Back to watchlist',
  },
  nl: {
    title: 'Deze pagina is niet geladen',
    body: 'Er ging iets mis bij het opbouwen van de pagina. De gegevens zelf zijn in orde — opnieuw laden helpt meestal.',
    retry: 'Opnieuw proberen',
    home: 'Terug naar volglijst',
  },
} as const;

function copyForLocale() {
  if (typeof document === 'undefined') return COPY.en;
  return document.cookie.includes('rib-locale=nl') ? COPY.nl : COPY.en;
}

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = copyForLocale();

  useEffect(() => {
    // Reported rather than swallowed. The digest is what ties this to the
    // server-side log entry when the failure happened during a render.
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'render',
        message: error.message,
        digest: error.digest ?? null,
        stack: error.stack?.slice(0, 2_000) ?? null,
        url: typeof location === 'undefined' ? null : location.href,
      }),
    }).catch(() => {
      // Reporting must never be the reason an error page fails to render.
    });
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold">{t.title}</h1>
      <p className="text-ink-muted mt-2 text-sm">{t.body}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition hover:bg-accent-hover"
        >
          {t.retry}
        </button>
        {/* A full reload, not a client navigation: if the client runtime is the
            thing that is broken, a router link would go nowhere. That is the
            whole point here, so the usual "use <Link>" rule is wrong for this
            one element. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="border-line-strong text-ink-muted hover:bg-surface-hover rounded-md border px-3 py-1.5 text-sm transition"
        >
          {t.home}
        </a>
      </div>

      {error.digest && (
        <p className="text-ink-faint mt-6 text-xs">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
