import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const t = await getTranslations('auth');

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 text-center">
      <h1 className="text-lg font-semibold">{t('signInFailed')}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {reason === 'not_allowed' ? t('notAllowed') : t('linkExpired')}
      </p>
      <Link href="/login" className="mt-4 text-sm underline">
        {t('tryAgain')}
      </Link>
    </main>
  );
}
