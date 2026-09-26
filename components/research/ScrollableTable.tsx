'use client';

import { useEffect, useRef } from 'react';

/**
 * A horizontally scrollable table that opens scrolled to its right edge.
 *
 * Time runs left to right, so the newest period is on the right — which is the
 * one a reader wants on load (round 2, item 2). This scrolls to the end on mount
 * (and when its content changes), while the row-label column stays sticky at the
 * left. With no JavaScript it is an ordinary scroll container that opens at the
 * left; the newest column is still reachable, just a scroll away.
 */
export function ScrollableTable({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  });
  return (
    <div ref={ref} className="overflow-x-auto">
      {children}
    </div>
  );
}
