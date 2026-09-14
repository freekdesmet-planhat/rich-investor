import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader } from '@/components/SiteHeader';

/**
 * The 404, in the app rather than beside it.
 *
 * Next's built-in page is an unstyled system screen with no header, no Dutch
 * and no way back, which reads as the app having fallen over. This file catches
 * both cases at once: a `notFound()` from a route segment (an unknown ticker)
 * and any URL that matches no route at all.
 *
 * Dynamic because the header reads the session and the copy follows the
 * reader's language, both of which come from cookies.
 */
export const dynamic = 'force-dynamic';

export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-16">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {t('body')}
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {t('back')}
        </Link>
      </main>
    </>
  );
}
