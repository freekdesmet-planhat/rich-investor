import { getTranslations } from 'next-intl/server';

/**
 * The verdict, in the app's three verdict colours and no others.
 *
 * These were straight Tailwind `emerald`/`amber`/`slate` pairs, which put the
 * single most important element on the page outside the design tokens — so
 * the verdict could drift away from the checklist rows that justify it. Both
 * now read from the same `pass`/`near`/`none` values.
 */
const TONE: Record<string, string> = {
  buy_worthy: 'bg-pass-wash text-pass border-pass-line',
  almost: 'bg-near-wash text-near border-near-line',
  watching: 'bg-none-wash text-none border-none-line',
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
      className={`inline-flex items-center rounded-full border font-semibold ${
        TONE[status] ?? TONE.watching
      } ${size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-0.5 text-xs'}`}
    >
      {t(status)}
    </span>
  );
}
