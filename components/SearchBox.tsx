'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Result {
  symbol: string;
  name: string | null;
  exchange: string | null;
}

/**
 * The shared search box (round 2, items 6 and 8).
 *
 * A debounced typeahead over /api/search. In "navigate" mode picking a result
 * opens its stock page (which analyses on demand, item 5); in "add" mode it calls
 * onPick, used by Compare to add a company to the set. Keyboard: ↑/↓ to move,
 * Enter to pick, Escape to close.
 */
export function SearchBox({
  placeholder,
  mode = 'navigate',
  onPick,
  className = '',
}: {
  placeholder: string;
  mode?: 'navigate' | 'add';
  onPick?: (symbol: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    const controller = new AbortController();
    // All state changes happen inside the debounce, never synchronously in the
    // effect, so a keystroke does not cascade a render before the request runs.
    const id = setTimeout(async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as { results?: Result[] };
        setResults(body.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or offline */
      }
    }, 200);
    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (symbol: string) => {
    setOpen(false);
    setQ('');
    setResults([]);
    if (mode === 'add') onPick?.(symbol);
    else router.push(`/stock/${encodeURIComponent(symbol)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[active];
      if (r) pick(r.symbol);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="border-line-strong bg-canvas text-ink w-full rounded-md border px-3 py-2 text-sm focus:border-accent focus:outline-none"
      />
      {open && results.length > 0 && (
        <ul className="border-line bg-surface shadow-raised absolute z-30 mt-1 w-full overflow-hidden rounded-md border text-sm">
          {results.map((r, i) => (
            <li key={r.symbol}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r.symbol)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left ${
                  i === active ? 'bg-surface-hover' : ''
                }`}
              >
                <span className="min-w-0 truncate text-ink">{r.name ?? r.symbol}</span>
                <span className="text-ink-subtle shrink-0 text-xs tabular-nums">{r.symbol}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
