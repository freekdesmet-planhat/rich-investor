# Design notes

The visual language for Rich Investor, established on the stock page and
applied to every page from there. This is the reference the rest of the
redesign checks against — if a page needs something that is not here, the
thing to do is add it here first, not invent it locally.

The target is the feel of stockanalysis.com, Notion and Robinhood: quiet,
information-forward, confident with whitespace, and quick to respond. Not a
trading terminal. Rich Investor's method is long-horizon, so the page should
read like a considered summary rather than a live feed.

## The one rule

**Components say what a thing is; `globals.css` decides what that looks
like.** Write `bg-surface`, not `bg-white dark:bg-slate-900`.

Before this pass, a card was `rounded-lg border border-slate-200 bg-white
dark:border-slate-800 dark:bg-slate-900`, written out by hand at every one of
the couple of dozen places a card appears — and slightly differently at
several of them. That is not a design system, it is a convention held
together by copy-paste. Two consequences worth stating, because they are why
this file exists:

- Changing the surface colour meant finding every instance.
- Light mode was never designed. It was whatever the `dark:` half happened to
  be written against. Both themes are first-class here; each value is picked
  for its own theme rather than derived from the other.

## Colour

All tokens live in `app/globals.css`, defined for light and dark, and exposed
to Tailwind through `@theme inline` — so every one is usable as an ordinary
utility (`bg-surface`, `text-ink-subtle`, `border-line`).

### Surfaces, back to front

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#f8fafc` | `#020617` | The page itself |
| `surface` | `#ffffff` | `#0f172a` | Cards, panels, anything lifted |
| `surface-sunken` | `#f1f5f9` | `#1e293b` | Wells: inset panels, table headers |
| `surface-hover` | `#f1f5f9` | `#1e293b` | Hover state on interactive rows |

In dark mode the canvas is *darker* than the surfaces, not lighter, so cards
read as lifted in both themes. Inverting the light values would have put the
cards below the page and lost that.

### Lines

| Token | Light | Dark | Use |
|---|---|---|---|
| `line` | `#e2e8f0` | `#1e293b` | Ordinary borders and rules |
| `line-strong` | `#cbd5e1` | `#334155` | Where a border has to carry weight |

### Text, by role rather than by lightness

| Token | Light | Dark | Use |
|---|---|---|---|
| `ink` | `#0f172a` | `#f1f5f9` | Primary text, figures |
| `ink-muted` | `#475569` | `#cbd5e1` | Secondary text, still meant to be read |
| `ink-subtle` | `#64748b` | `#94a3b8` | Labels, captions, units, provenance |
| `ink-faint` | `#94a3b8` | `#64748b` | Placeholders, disabled, decorative |

Naming by role is what keeps this usable. `text-slate-500` tells you a
lightness; `text-ink-subtle` tells you the thing is a caption, which is the
decision a component author is actually making.

### Verdict colours

Four states, and **nothing outside a verdict may use them**. The status
badge, the checklist rows and the ratio dots all read from these, so a green
dot on a ratio card is the same green as the verdict it feeds.

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `pass` | `#15803d` | `#4ade80` | Condition met |
| `near` | `#b45309` | `#fbbf24` | Close, or a caution |
| `fail` | `#b91c1c` | `#f87171` | Condition not met |
| `none` | `#64748b` | `#94a3b8` | Not applicable, or no data |

Each has a `-wash` (background) and `-line` (border) companion for chips and
banners.

Two deliberate choices here:

- **Desaturated.** Nine conditions render a lot of colour at once, and at
  full saturation the page reads as an alarm rather than a summary. The
  previous straight `emerald-500`/`rose-500` also failed contrast at small
  sizes on a white ground.
- **Grey is a real answer.** `none` exists so "not applicable to a bank" and
  "no data" cannot be mistaken for a failure. This matters: the app's whole
  claim is that it is honest about what it does not know.

Colour never carries meaning alone — every verdict also has a label or an
icon, for colour-blind readers and for anyone skimming.

### Accent

`accent` (`#1d4ed8` light, `#60a5fa` dark) for links, focus rings and the
primary action. One accent, used sparingly. A page with two accents has none.

## Typography

**Geist Sans** throughout, **Geist Mono** for figures where alignment matters
more than texture.

Both were already being downloaded by the layout and neither was being used:
`globals.css` set `font-family: Arial, Helvetica, sans-serif` on `body`,
which beat the font variables on `<html>`. Fixing that one line is most of
the typographic change on its own.

| Role | Size / weight | Notes |
|---|---|---|
| Page title | `text-3xl font-semibold tracking-tight` | The ticker. One per page |
| Headline figure | `text-xl font-medium tabular-nums` | Price beside the ticker |
| Section heading | `text-xs font-semibold uppercase tracking-wider` | `text-ink-subtle` |
| Body | `text-sm` | Default for prose and table cells |
| Stat value | `text-lg font-semibold tabular-nums` | |
| Caption | `text-xs` | `text-ink-subtle` or `text-ink-faint` |

Section headings are small, uppercase and tracked rather than just a smaller
bold sentence. A page with a dozen headings and one real title needs them to
be a different *kind* of thing, not a smaller version of the same thing —
otherwise the page reads as a stack of equally important blocks.

**Every figure is `tabular-nums`.** `table` gets it in `globals.css` so it
cannot be forgotten. Numbers in a column are there to be compared with each
other, and proportional digits make that harder for no gain.

## Spacing

4px base, via Tailwind's default scale.

| Context | Value |
|---|---|
| Between major page sections | `mt-8` (32px) — use `<Section>` |
| Card padding | `p-4`, or `p-5 sm:p-6` for a `loose` card |
| Heading to its content | `mb-3` (12px) |
| Between related items in a group | `gap-2` / `gap-3` |
| Page gutter | `px-4`, container `max-w-5xl` |

Section rhythm is one number in one place. The stock page had reached five
different top margins between sections — `mt-2`, `mt-3`, `mt-5`, `mt-6`,
`mt-8` — none of which meant anything; each was a guess made while writing
the section below it.

## Shape and elevation

- Radius: `rounded-xl` (12px) for cards and panels, `rounded-lg` (8px) for
  inner elements, `rounded-full` for badges and dots.
- Elevation: `shadow-card` for resting cards, `shadow-raised` for dialogs and
  popovers. Nothing heavier. Depth comes from the surface ladder, not shadow.

## Primitives

In `components/ui/Surface.tsx`. Small on purpose — these are the five things
the stock page needed, and each page in the rollout adds to it only when it
genuinely needs something new.

| Component | Use |
|---|---|
| `<Card>` | Anything lifted off the page. `tone="sunken"` for an inset well, `padding="loose"` for a feature panel |
| `<Section>` | One major block. Owns the vertical rhythm |
| `<SectionHeading>` | The heading, with an optional right-aligned `action` slot |
| `<Stat>` | A label above a figure. `tone` for verdict-coloured values |
| `<Chip>` | Small inline metadata. `tone` only where it carries a verdict |

## Tables and figures

- Numeric columns right-aligned, labels left-aligned.
- `tabular-nums` everywhere (automatic inside `table`).
- Row separators `divide-line`, no vertical rules, no zebra striping. Density
  comes from tight padding, not from lines.
- Growth percentages in muted `pass`/`fail`, never full-saturation.
- Sparklines and charts: `currentColor` where possible so they inherit the
  surrounding text colour and need no per-theme handling.
- A missing value is an em dash (`—`) plus, where there is room, a reason.
  Never a blank cell, and never `0`.

## Both themes, always

Every new surface must be checked in light and dark. The tokens make this
mostly automatic, but two things still need a person:

- **Contrast.** Text on a `-wash` background is the usual failure. `near` on
  `near-wash` is the tightest pairing in the set; anything tighter than that
  needs rethinking rather than shipping.
- **Charts and SVG.** Hardcoded stroke and fill colours do not follow the
  theme. Use `currentColor` or a token.

Dark mode currently follows `prefers-color-scheme`. The tokens are also
defined under `[data-theme="dark"]` and `[data-theme="light"]`, so an explicit
toggle has something to drive when the navigation work adds one — no second
pass over the CSS required.

## Motion

Sparing. Transitions on colour and opacity at 150ms; nothing that moves
layout. `prefers-reduced-motion` is honoured globally in `globals.css`.

The interaction quality the brief asks for is about *latency*, not animation
— adding to a watchlist, saving a review and changing a chart range should
feel instant. Optimistic updates beat spinners; a spinner that appears for
80ms is worse than no spinner.

## What this pass deliberately did not change

- **The information hierarchy.** Verdict, chart, AI thesis and qualitative
  review remain what a user sees first. The brief locks this, and it is
  right: the visual language around the hierarchy is what was changing.
- **The nine conditions and their thresholds.** Untouched, as the ground
  rules require.
- **Copy.** The `(from the book)` references are a separate pass (item 4).
- **Every other page.** Shared components used by the stock page — the status
  badge, ratio cards, colour dots — now read from the tokens, so the
  watchlist, compare and suggestions pages pick up the new verdict colours
  for free. Their layout and spacing are untouched and still on the old
  ad-hoc rhythm. That is the item 3 rollout.
