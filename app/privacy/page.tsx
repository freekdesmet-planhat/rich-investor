import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy');
  return { title: `${t('title')} — Rich Investor` };
}

/**
 * The privacy notice for the public waitlist (launch item 11).
 *
 * A placeholder, flagged for the owner's legal review before launch: collecting
 * an email needs a notice, and shipping the form without one would be the wrong
 * order. Public, like the landing page it is linked from.
 */
export default async function PrivacyPage() {
  const t = await getTranslations('privacy');
  return (
    <>
      <header className="border-line border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href="/" className="text-base font-semibold tracking-tight text-ink">
            Rich Investor
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-ink text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-ink-muted mt-4 max-w-2xl text-sm leading-relaxed">{t('placeholder')}</p>
      </main>
    </>
  );
}
