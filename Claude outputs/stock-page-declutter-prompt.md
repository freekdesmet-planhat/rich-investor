# Prompt for the terminal session — declutter the stock page

Paste the block below into Claude Code in `~/rich-investor-app`.

---

The individual stock page (`app/stock/[symbol]/page.tsx`) has too much on it.
Checked `/stock/ADBE` live and it's overwhelming — confirmed by reading the
component: it's 1043 lines and stacks roughly a dozen full sections plus a
20-card ratio grid on one page (header, why-card, price chart, valuation-range
chart with a decline-severity sub-card, the 9-condition checklist, a growth
trajectory panel, all 20 ratio cards, earnings-quality notes, peer comparison,
analyst estimates, AI thesis, condition trend, position block, qualitative
review).

This isn't a new design problem, it's a drift from the ground rule already in
NEXT-STEPS.md: "the buy-worthy verdict, the chart, the AI thesis, and the
qualitative review are what a user sees first; full financials and dense
tables live behind the 'Full research' tab." Items 7-14 (insider data,
earnings calendar, valuation range, peer comparison, decline context,
liquidity, earnings quality) each got built as their own full `Section` with
a heading and intro paragraph, bolted onto the main page instead of being
checked against that rule. Only the raw financial statements went behind
`app/stock/[symbol]/research/page.tsx`. Fix that now, before it's copied
elsewhere.

## What stays on the main page

The actual decision path, nothing else:
- Header (ticker, price, name, sector/growth/PEG-basis chips, earnings chip,
  liquidity note — these inline signals are fine, keep the pattern)
- The "why" verdict card
- The price chart
- The 9-condition checklist
- AI thesis
- Qualitative review

Add one trimmed row of 5-6 headline ratios (PE, PEG, ROE, a margin, debt)
with a "see all 20 in Full research →" link, replacing the full 20-card grid
on the default view.

## What moves into Full research

These are the "dense tables" the ground rule already named:
- The full 20-card ratio grid (`CARD_ORDER` in page.tsx)
- The valuation-range chart and its decline-severity sub-card
- The growth trajectory panel
- Earnings-quality notes
- Peer comparison
- Analyst estimates

Move the rendering, not the computation — the data-fetching and derived
values (`peers`, `valuation`, `decline`, `qualityNotes`, `trajectory`, etc.)
stay exactly as they are, they just render inside
`app/stock/[symbol]/research/page.tsx` instead of the main page. Add
whatever tab/section structure in Full research makes sense for these
alongside the existing financials/news/filings tabs — your call on the
UI pattern there, but keep it consistent with the design-notes conventions
for that tab (horizontal tab strip, dense tables).

## What downgrades to an inline signal instead of a section

Don't move these, shrink them:
- Peer comparison → a one-line "vs. sector median" caption on the relevant
  ratio cards, not a standalone card with its own heading and intro
- Decline-severity context → one caveat sentence under the valuation-range
  chart (wherever that ends up), not a separate sunken card
- Condition trend ("what changed since last time") → fold into the checklist
  itself as a small delta marker per row, instead of a disconnected block
  further down the page

## Ground rules (unchanged)

- Don't touch the checklist logic, thresholds, or any computed values — this
  is a rendering/layout change only.
- Keep both light and dark mode working throughout (screenshot both before
  calling this done).
- Keep EN/NL bilingual coverage — moving a section doesn't mean dropping its
  translations.
- Full gate clean before you call it done: tests, build, `db:validate`.
- Log it in NEXT-STEPS.md's Log section the way you have been, and report
  back what moved where and anything you had to judgment-call rather than
  found explicitly specified above.
