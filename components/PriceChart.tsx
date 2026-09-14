'use client';

import { useState } from 'react';
import {
  axisTicks,
  drawdownFrom,
  entryLevel,
  nearestIndex,
  type PricePoint,
} from '@/lib/data/priceRange';
import { formatCurrency, formatPercent } from '@/lib/i18n/format';
import type { Lang } from '@/lib/i18n/locale';

export interface PriceChartLabels {
  high: string;
  now: string;
  drawdown: string;
  /** The level at which the decline reaches the book's entry threshold. */
  entry: string;
  chart: string;
}

/**
 * The price, against the two levels the page is judging it by.
 *
 * It was a line, a dashed high and nothing else: no axis, so no value could be
 * read off it; no way to see where the decline began inside five years of
 * history; and no mark for the 50% fall that is the book's entry signal — the
 * one level the whole page exists to test the price against. All three are
 * drawn now, and hovering reads a date and a price off the series.
 *
 * A client component for the crosshair alone. The line, the axis, both levels
 * and the caption are all in the server-rendered markup, so the chart is
 * complete and readable before any JavaScript arrives; the pointer only adds a
 * readout on top of it.
 */
export function PriceChart({
  points,
  high,
  highDate,
  currency,
  locale,
  labels,
}: {
  points: PricePoint[];
  high: number | null;
  highDate: string | null;
  /**
   * The currency and locale rather than formatting functions: a function
   * cannot cross from a server component into a client one, and the axis and
   * the hover readout both format values this component works out for itself.
   */
  currency: string | null;
  locale: Lang;
  labels: PriceChartLabels;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const formatMoney = (value: number | null) => formatCurrency(value, currency, locale);

  if (points.length < 2) return null;

  // One point per trading day over five years is far more than the width can
  // resolve; sampling keeps the path small without changing its shape.
  const maxPoints = 320;
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const width = 720;
  const height = 220;
  // Room on the right for the axis labels, which used to be nowhere.
  const padding = { top: 12, right: 56, bottom: 22, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const closes = sampled.map((p) => p.close);
  const entry = entryLevel(high);
  // The entry level is part of the picture even when the price never fell that
  // far — a chart that cropped it out would hide how far there is still to go.
  const candidates = [...closes, ...(high != null ? [high] : []), ...(entry != null ? [entry] : [])];
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || 1;

  const x = (i: number) => padding.left + (i / (sampled.length - 1)) * innerW;
  const y = (value: number) => padding.top + innerH - ((value - min) / span) * innerH;

  const line = sampled
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(sampled.length - 1).toFixed(1)},${padding.top + innerH} L${padding.left},${
    padding.top + innerH
  } Z`;

  const last = sampled[sampled.length - 1];
  const highY = high != null ? y(high) : null;
  const entryY = entry != null ? y(entry) : null;
  const drawdown = drawdownFrom(high, last.close);

  const ticks = axisTicks(min, max, 3);
  const active = hover != null ? sampled[hover] : null;

  const onPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    // The plot is inset from the viewBox, so the pointer is mapped against the
    // drawn area rather than the whole element.
    const fraction =
      ((event.clientX - box.left) / box.width - padding.left / width) / (innerW / width);
    setHover(nearestIndex(sampled, fraction));
  };

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-48 w-full touch-none sm:h-56"
        preserveAspectRatio="none"
        role="img"
        aria-label={labels.chart}
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Axis: three gridlines with their values, so a point on the line can
            be turned into a number without hovering at all. */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth="1"
            />
            <text
              x={width - padding.right + 6}
              y={y(tick) + 3}
              className="fill-slate-400 text-[10px] dark:fill-slate-500"
            >
              {formatMoney(tick)}
            </text>
          </g>
        ))}

        {highY != null && (
          <g>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={highY}
              y2={highY}
              strokeDasharray="4 4"
              className="stroke-amber-500/70"
              strokeWidth="1"
            />
            {/* Anchored at the right edge, off the plot, rather than printed
                across the line it belongs to. */}
            <text
              x={width - padding.right - 4}
              y={highY - 4}
              textAnchor="end"
              className="fill-amber-600 text-[10px] dark:fill-amber-400"
            >
              {labels.high}
              {highDate ? ` · ${highDate.slice(0, 7)}` : ''}
            </text>
          </g>
        )}

        {/* The level the condition is actually testing for. */}
        {entryY != null && (
          <g>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={entryY}
              y2={entryY}
              strokeDasharray="2 3"
              className="stroke-emerald-600/70"
              strokeWidth="1"
            />
            <text
              x={width - padding.right - 4}
              y={entryY - 4}
              textAnchor="end"
              className="fill-emerald-700 text-[10px] dark:fill-emerald-400"
            >
              {labels.entry}
            </text>
          </g>
        )}

        <g className="text-sky-600 dark:text-sky-400">
          <path d={area} fill="url(#priceFill)" />
          <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </g>

        <circle
          cx={x(sampled.length - 1)}
          cy={y(last.close)}
          r="3"
          className="fill-sky-600 dark:fill-sky-400"
        />

        {active && hover != null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padding.top}
              y2={padding.top + innerH}
              className="stroke-slate-400 dark:stroke-slate-500"
              strokeWidth="1"
            />
            <circle cx={x(hover)} cy={y(active.close)} r="3.5" className="fill-slate-700 dark:fill-slate-200" />
          </g>
        )}
      </svg>

      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        {/* The hovered reading replaces the date range while the pointer is
            down, which is the only place a value-and-date pair can go without
            the layout jumping. */}
        {active ? (
          <span className="font-medium text-slate-700 tabular-nums dark:text-slate-200">
            {active.date} · {formatMoney(active.close)}
          </span>
        ) : (
          <span className="tabular-nums">
            {sampled[0].date} — {last.date}
          </span>
        )}
        <span>
          {labels.now} <span className="tabular-nums">{formatMoney(last.close)}</span>
        </span>
        {high != null && (
          <span>
            {labels.high} <span className="tabular-nums">{formatMoney(high)}</span>
          </span>
        )}
        {drawdown != null && (
          <span className={drawdown <= -0.5 ? 'font-medium text-emerald-600 dark:text-emerald-400' : ''}>
            {labels.drawdown}{' '}
            <span className="tabular-nums">{formatPercent(drawdown, locale)}</span>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
