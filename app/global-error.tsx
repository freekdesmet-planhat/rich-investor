'use client';

/**
 * The last resort: a failure in the root layout itself.
 *
 * `error.tsx` lives inside the layout, so it cannot catch a layout that throws.
 * This one replaces the whole document, which is why it has to render its own
 * <html> and <body> and cannot rely on anything the app normally provides —
 * including its stylesheet, hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const nl = typeof document !== 'undefined' && document.cookie.includes('rib-locale=nl');

  return (
    <html lang={nl ? 'nl' : 'en'}>
      <body
        style={{
          margin: 0,
          padding: '4rem 1rem',
          fontFamily: 'system-ui, sans-serif',
          color: '#0f172a',
          background: '#fff',
        }}
      >
        <main style={{ maxWidth: '36rem', margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.25rem', margin: 0 }}>
            {nl ? 'De app kon niet starten' : 'The app could not start'}
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#475569' }}>
            {nl
              ? 'Er ging iets mis buiten de pagina zelf. Opnieuw laden helpt meestal.'
              : 'Something went wrong outside the page itself. Reloading usually fixes it.'}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 0.75rem',
              fontSize: '0.875rem',
              borderRadius: '0.375rem',
              border: 0,
              background: '#0f172a',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {nl ? 'Opnieuw proberen' : 'Try again'}
          </button>
          {error.digest && (
            <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
              Reference: <span style={{ fontFamily: 'monospace' }}>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
