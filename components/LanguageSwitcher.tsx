import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale } from '@/app/actions';
import { LOCALES } from '@/lib/i18n/config';

const FLAG: Record<string, string> = { en: '🇬🇧', nl: '🇳🇱' };

export async function LanguageSwitcher() {
  const current = await getLocale();
  const t = await getTranslations('language');

  return (
    <div className="flex items-center gap-1" aria-label={t('label')}>
      {LOCALES.map((locale) => (
        <form action={setLocale} key={locale}>
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            aria-current={locale === current ? 'true' : undefined}
            className={`rounded px-2 py-1 text-xs transition ${
              locale === current
                ? 'bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-slate-50'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <span aria-hidden="true">{FLAG[locale]}</span>{' '}
            <span>{t(locale)}</span>
          </button>
        </form>
      ))}
    </div>
  );
}
