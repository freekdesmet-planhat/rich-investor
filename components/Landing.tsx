import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from './LanguageSwitcher';
import { WaitlistForm } from './WaitlistForm';
import { DEMO_SYMBOLS } from '@/lib/data/landing';

/**
 * The public front door (launch item 11).
 *
 * Shown at "/" to anyone not signed in: what the app does, the honest cadence
 * computed live, three read-only demo companies, and a waitlist. No product data
 * is read here — the demos read their own, scoped to three symbols — so the page
 * is safe to serve to the world and safe to index.
 */
export async function Landing({ count }: { count: number }) {
  const [t, locale] = await Promise.all([getTranslations('landing'), getLocale()]);

  return (
    <>
      <header className="border-line border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <span className="text-base font-semibold tracking-tight text-ink">Rich Investor</span>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/login"
              className="border-line-strong text-ink-muted hover:bg-surface-hover rounded-md border px-3 py-1.5 text-sm transition"
            >
              {t('signIn')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-ink text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('headline')}
        </h1>
        <p className="text-ink-muted mt-4 max-w-2xl text-base leading-relaxed">{t('sub')}</p>

        {/* The cadence, computed live so the claim is never stale (audit section 1). */}
        <p className="text-ink-subtle border-line bg-surface-sunken mt-6 rounded-lg border px-4 py-3 text-sm">
          {t('cadence', { count })}
        </p>

        <section className="mt-10">
          <h2 className="text-ink text-lg font-semibold">{t('waitlistHeading')}</h2>
          <p className="text-ink-subtle mb-3 mt-1 text-sm">{t('waitlistIntro')}</p>
          <WaitlistForm
            locale={locale}
            labels={{
              emailPlaceholder: t('emailPlaceholder'),
              join: t('join'),
              joining: t('joining'),
              joined: t('joined'),
              invalid: t('invalid'),
              error: t('error'),
            }}
          />
          <p className="text-ink-faint mt-2 text-xs">
            {t.rich('privacyNote', {
              privacy: (chunks) => (
                <Link href="/privacy" className="underline underline-offset-2 hover:text-ink-subtle">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-ink text-lg font-semibold">{t('demoHeading')}</h2>
          <p className="text-ink-subtle mb-3 mt-1 text-sm">{t('demoIntro')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {DEMO_SYMBOLS.map((symbol) => (
              <Link
                key={symbol}
                href={`/demo/${encodeURIComponent(symbol)}`}
                className="bg-surface border-line hover:bg-surface-hover rounded-xl border px-4 py-3 text-sm font-medium text-ink transition"
              >
                {symbol}
                <span aria-hidden="true" className="text-accent ml-2">→</span>
              </Link>
            ))}
          </div>
        </section>

        <p className="text-ink-faint mt-16 border-t border-line pt-6 text-xs">{t('notAdvice')}</p>
      </main>
    </>
  );
}
