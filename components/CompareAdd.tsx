'use client';

import { useRouter } from 'next/navigation';
import { SearchBox } from './SearchBox';
import { compareHref } from '@/lib/data/compareView';

/**
 * The search-to-add control on Compare (round 2, item 6): pick any company and it
 * joins the comparison via the URL, analysed on demand if it has no evaluation yet.
 */
export function CompareAdd({
  chosen,
  placeholder,
  full,
  fullLabel,
}: {
  chosen: string[];
  placeholder: string;
  full: boolean;
  fullLabel: string;
}) {
  const router = useRouter();
  if (full) return <p className="text-ink-subtle text-xs">{fullLabel}</p>;
  return (
    <SearchBox
      placeholder={placeholder}
      mode="add"
      onPick={(symbol) => router.push(compareHref([...chosen, symbol]))}
      className="max-w-sm"
    />
  );
}
