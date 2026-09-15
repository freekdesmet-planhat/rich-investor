'use client';

import { useEffect } from 'react';

/**
 * Sends uncaught client errors somewhere they can be read.
 *
 * Mounted in the root layout so it is listening before any page renders. It
 * catches the two things that otherwise vanish silently: an uncaught error
 * (`window.onerror`) and a rejected promise nobody handled — which is what a
 * failed fetch inside an effect becomes.
 *
 * Errors are sent with `sendBeacon` where it exists, because the interesting
 * ones often happen as the page is being torn down, and a normal fetch is
 * cancelled at exactly that moment.
 */
const SEEN = new Set<string>();

function report(kind: string, message: string, stack?: string | null) {
  // The same broken render can fire the same error on every frame; one report
  // of each is enough to diagnose and a hundred is a self-inflicted flood.
  const key = `${kind}:${message}`;
  if (SEEN.has(key)) return;
  SEEN.add(key);

  const body = JSON.stringify({
    kind,
    message: message.slice(0, 500),
    stack: stack?.slice(0, 2_000) ?? null,
    url: location.href,
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-errors', new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {
    // Falls through to fetch.
  }

  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Reporting a failure must never itself become an unhandled rejection.
  });
}

export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      report('window.onerror', event.message || String(event.error), event.error?.stack);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      report(
        'unhandledrejection',
        reason instanceof Error ? reason.message : String(reason),
        reason instanceof Error ? reason.stack : null,
      );
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
