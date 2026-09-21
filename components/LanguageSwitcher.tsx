import { getLocale, getTranslations } from 'next-intl/server';
import { setLocale } from '@/app/actions';
import { LOCALES, type Lang } from '@/lib/i18n/config';

const FLAG: Record<string, string> = { en: '🇬🇧', nl: '🇳🇱' };

/**
 * One button, showing the language you would switch *to*.
 *
 * Two permanent buttons spelled out "English" and "Nederlands" side by side and
 * took roughly a third of the header's width to say something the reader
 * already knows — which language they are reading. With two languages the
 * control is a toggle, so it shows the other one and nothing else.
 *
 * Still a form posting to a server action rather than a client component: the
 * choice is a cookie the server reads, and this way it works before hydration.
 */
export async function LanguageSwitcher({ className = '' }: { className?: string }) {
  const current = (await getLocale()) as Lang;
  const t = await getTranslations('language');

  const next = (LOCALES.find((locale) => locale !== current) ?? current) as Lang;

  return (
    <form action={setLocale} className={className}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        // The button says "Nederlands"; a screen reader needs to hear that
        // pressing it switches, not that it is a label.
        aria-label={t('switchTo', { language: t(next) })}
        title={t('switchTo', { language: t(next) })}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-subtle transition hover:bg-surface-hover hover:text-ink"
      >
        <span aria-hidden="true">{FLAG[next]}</span>
        <span className="uppercase">{next}</span>
      </button>
    </form>
  );
}
