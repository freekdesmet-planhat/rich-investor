import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageSwitcher } from './LanguageSwitcher';

export async function SiteHeader() {
  const t = await getTranslations('app');

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="min-w-0">
          <span className="block truncate text-base font-semibold">{t('name')}</span>
          <span className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
            {t('tagline')}
          </span>
        </Link>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
