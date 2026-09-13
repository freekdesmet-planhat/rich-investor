import { getTranslations } from 'next-intl/server';

const TONE: Record<string, string> = {
  buy_worthy:
    'bg-emerald-50 text-emerald-800 ring-emerald-600/30 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-400/30',
  almost:
    'bg-amber-50 text-amber-900 ring-amber-600/30 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-400/30',
  watching:
    'bg-slate-100 text-slate-700 ring-slate-500/25 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-400/25',
};

export async function StatusBadge({
  status,
  size = 'sm',
}: {
  status: string;
  size?: 'sm' | 'lg';
}) {
  const t = await getTranslations('status');
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${
        TONE[status] ?? TONE.watching
      } ${size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}
    >
      {t(status)}
    </span>
  );
}
