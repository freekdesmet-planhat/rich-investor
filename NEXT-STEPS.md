# Rich Investor — Next steps for Claude Code

Context: this is heading toward a paid subscription launch in about a month,
large-cap framework only for this release. It's built on Supabase, Netlify,
and GitHub, and applies a fixed checklist from the book "Rijke Belegger, Arme
Belegger" to a universe of large-cap stocks, telling the user which ones are
buy-worthy, almost there, or still watching. Billing, signup, and payment
infrastructure are explicitly NOT part of this build, they get added later in
a separate environment once this codebase is in a state worth shipping.
Small-cap/mid-cap and ETF frameworks are also a later version, not this one,
they need their own research and may end up as a paid upgrade tier eventually.

**First thing, before anything else:** check `cron_runs` for last night's
02:00 and 02:15 rows and report whether both completed cleanly. This doesn't
block the work below, it's unrelated front-end work, just want it confirmed
either way before we call the pipeline fix fully closed.

## Before writing code

Read through the existing routes (`/`, `/search`, `/suggestions`, `/compare`,
`/stock/:ticker`, `/account`) and the current data providers (yahoo-finance2,
financial-modeling-prep) so you understand what's already wired up. Then come
back with a short plan and flag anywhere a feature below needs a data source,
field, or API tier we don't currently have, before building against it.
Confirm a data gap up front rather than faking or stubbing financial data. If
FMP's free tier turns out not to cover insider trades, the earnings
calendar, or bid-ask spread data (items 7, 8, and 13 below), stop and ask
rather than dropping the item quietly.

## Ground rules

- The book's own thresholds (P/E ceiling, PEG bands, 50% decline, $10bn
  floor) stay locked and untouched. Only the app-default thresholds in
  Account are ever user-editable.
- Rebrand the copy: stop citing "(from the book)" scattered through every
  metric tooltip and threshold. The app presents this as its own methodology
  in its own voice. Keep one clear credit to "Rijke Belegger, Arme Belegger"
  somewhere sensible (an About or Methodology page), not removed entirely,
  just not repeated everywhere.
- The checklist/verdict-first information hierarchy of the stock page stays:
  the buy-worthy verdict, the chart, the AI thesis, and the qualitative
  review are what a user sees first; full financials and dense tables live
  behind the "Full research" tab from item 6. The visual language around
  that hierarchy is what's changing in this redesign, not the hierarchy
  itself.
- The qualitative-review workflow (temporary vs structural, catalysts, sell
  signals, Howard Marks' question) and the "not investment advice" framing
  are core product, not decoration. They survive the redesign in substance.
- Support both light and dark mode from here on, not dark-only.
- Keep EN/NL bilingual coverage for all new and rewritten copy.
- Keep this a single-owner data model, no multi-user support in this phase.

## Design direction

Aim for the clean, minimal, information-forward feel of stockanalysis.com,
Notion, and Robinhood: fast, clutter-free, confident use of whitespace, and
quick, responsive interactions (adding to a watchlist, saving a review,
navigating a chart should all feel instant). This is not a request for trade
execution or day-trading technical indicators (RSI/MACD-style); Rich
Investor doesn't touch brokerage functionality and its method is
long-horizon, not technical trading. The reference is to interaction quality
and visual polish, not those specific features.

Because this touches every page, don't reskin everything at once. Build the
new visual language on ONE representative page first, the individual stock
page is the best candidate since it has the most surface area (verdict,
chart, AI thesis, qualitative review). Produce a short design-notes file
alongside it (colors, spacing, type scale, table/chart conventions, light
and dark values) that the rest of the work checks against. Show that one
page and the design-notes file before touching anything else. Once
approved, roll the same language out to the rest.

## Build order

### 1. Design direction on the stock page

One page, plus the design-notes file described above. Stop here for review
before continuing to item 2.

### 2. Navigation overhaul

Once the visual language is approved, fix navigation across the app. Clunky
navigation is the specific thing that would get this sent back for rework,
so treat it as equally important as the visual redesign, not an afterthought.

### 3. Roll the new visual language out everywhere

Dashboard/watchlist, search, suggestions, compare, account. Same
design-notes file from item 1, no new patterns invented per page.

### 4. Rebrand copy pass

Remove the scattered "(from the book)" references per the ground rules
above; add one clear methodology/credit page. Do this alongside item 3
rather than as a separate pass, since it's mostly copy changes on pages
you're already touching.

### 5. Onboarding / "how this works" primer

A short walkthrough, reachable from the nav and shown automatically the
first time someone signs in, that explains: what the nine conditions mean
in plain language, why decline-from-high and PEG are checked together, and
what buy-worthy / almost there / watching mean. Plain and conversational,
explains things without assuming the reader has read the book.

## Fast-follow, after items 1-5 ship, if the month allows

These were the original six enhancement items identified from a competitive
gap analysis against Koyfin, Finviz, StockAnalysis.com, and Morningstar.
Sequence within this tier is flexible, but land items 1-5 above first so
these get built in the new design language rather than needing rework.

### 6. Progressive-disclosure research tab on the stock page

Add a secondary tab or expandable section ("Full research"), separate from
the default checklist view, containing:

- Income statement, balance sheet, and cash flow statement, as many years as
  the data source supports
- A news feed for the ticker
- Links to recent filings
- Earnings call transcripts, if the data source has them

One click away from the default view, never shown by default.

UI direction for this tab specifically: model it on stockanalysis.com's
stock page. Concretely:

- A horizontal tab strip for sections within "Full research" (Financials,
  News, Filings), the same pattern as top-level nav, not a single long
  scroll
- Within Financials, sub-tabs for Income Statement / Balance Sheet / Cash
  Flow, each with an Annual/Quarterly period toggle
- Dense, right-aligned numeric tables with expandable row groups for line
  items that have a breakdown (e.g. Revenue → Revenue Growth), muted
  green/red for growth percentages, consistent with the app's own color
  conventions from the item 1 design-notes file
- A small inline chart affordance per row for a single line item's trend, if
  it's not much extra work once the table exists

This density is intentional here, and only here. It does not extend to the
default checklist view (see ground rules above).

### 7. Insider transaction data, wired to the existing catalyst checkbox

Surface each stock's insider buy/sell activity (last 90 days to start). On
the qualitative review section, the "Management is buying its own shares"
catalyst checkbox should show this data next to it instead of asking the
user to verify it elsewhere.

### 8. Earnings calendar

Show the next earnings date on each stock's page. In the daily digest email,
flag when a watchlist name is reporting soon, since that's usually when
"temporary vs structural" actually gets answered.

### 9. The stock's own historical valuation range

Extend the existing price/drawdown chart (or add one alongside it) that
plots the stock's own P/E and/or PEG over its 5-year history, so a user can
see "cheap vs its own typical multiple," not just "down from its 5-year
high."

### 10. Peer/sector comparison on the stock page

Add sector-relative context for the key metrics already in the checklist
table (P/E, ROE, margins) against the sector median, using the sector
classification the app already uses for watchlist filtering.

### 11. Historical decline-severity and recovery-time context

Next to the existing decline-from-5-year-high trigger (and on the
historical valuation-range chart from item 9), add a short factual
context line drawn from SBBI's own historical bear-market table: only 2
of the 17 US declines over 20% (real terms) since 1870 have gone past
50% (the 1929 crash at -79%, and the 2000-09 dot-com-plus-financial-crisis
decline at -54%), and past recoveries from major declines have taken
anywhere from 20 months to 13 years. This is context, not a new
condition. It doesn't change the buy-worthy/almost-there/watching
verdict, it just tells the user how rare, and how slow to recover, a
move like the one they're looking at has historically been.

### 12. Methodology page: why thresholds get revisited

Add a short, plain-language paragraph to the About/Methodology page (from
item 4) explaining that the app's fixed thresholds get periodically
re-checked against fresh data rather than treated as permanently true.
This isn't just honesty for its own sake, it's a real answer to "why 30
P/E and not 25" for a paying user. Keep it to one short paragraph, no
need to cite the underlying research by name.

### 13. Liquidity/tradability flag

Add bid-ask spread and average daily volume as an informational flag on
the stock page, not a new pass/fail condition, it doesn't change the
verdict, the book's 9 conditions stay exactly as they are. Even large-cap
names can have real execution costs in a thin or volatile market, and
that's been invisible in the app so far. Check upfront whether the
current data providers expose bid-ask spread on the free tier; if not,
average volume alone is still worth showing, and flag the gap rather
than dropping the feature quietly (see "Before writing code" above).

### 14. Earnings-quality flag beyond the cash-flow ratio

The existing cash-flow-quality condition (FCF positive, OCF ≥70-100% of
NI) already catches a lot of this, but add one more informational flag:
where GAAP or adjusted EPS diverges significantly from free cash flow per
share, or stock-based comp/dilution is unusually high relative to peers,
surface a short note. Same rule as item 13: informational only, doesn't
touch the locked verdict logic.

## Working style

Work through these one at a time. After each one, report what was built,
what data source or design decision it relies on, and anything left out
because of a gap, rather than moving straight to the next item. You don't
need to wait for a go-ahead between items, but stop and ask whenever
something is genuinely ambiguous rather than guessing, especially on design
direction and on any data-source gap in items 7 or 8.

---

## Log

- 2026-09-20: Brief drafted after a competitive gap analysis against Koyfin,
  Finviz, StockAnalysis.com, and Morningstar. Not started yet.
- 2026-09-20: Before item 1 started, an audit of the live system found the
  nightly cron pipeline had been dying silently since 09-18 (watchlist half
  completes in ~18s and writes signal_history; the universe scan never
  starts, so the cursor never advances and suggestions have been frozen on
  the same 4 rows since 09-13). Root cause: two separate Netlify ceilings, a
  ~26s connection limit (what the caller sees) and a ~60s execution limit
  (invisible to the caller, found only by heartbeating into Postgres).
  Combined watchlist + scan ran ~62s, over the 60s ceiling by about 2
  seconds. Fixed by splitting the scan into its own pg_cron schedule at
  02:15, 15 minutes behind the watchlist's 02:00, so neither request has to
  do both halves of the work. Stale "running" rows now auto-expire to
  timed_out after 10 minutes via a reapStale check at the start of each job.
  Manual runs confirmed clean with notify=false; unattended confirmation was
  pending as of end of day 09-20.
- 2026-09-21: Unattended confirmation came clean. 02:00 nightly-scan ok in
  42.9s (32 tickers); 02:15 universe-scan ok in 32.7s, 27 candidates
  evaluated, 1 suggestion filed (DECK, buy_worthy), cursor 47 -> 108. The
  pipeline fix is closed.
- 2026-09-21: **Known risk, not being fixed now.** Watchlist ran 42.9s
  against the ~60s ceiling on the first unattended night (~17s margin).
  Worth re-checking as the universe/watchlist grows or more work gets added
  to that route, since this is the same failure mode that was just fixed —
  and unlike the scan, when the watchlist dies the daily digest dies with
  it. Two plausible answers when it comes to that: batch the watchlist
  across requests the way the scan now is, or price a Netlify plan upgrade
  (the route already declares `maxDuration = 300`, so that would need no
  code change). Its own decision, not a rushed change riding on something
  else.
- 2026-09-20: Scope substantially expanded after a proper spec discussion.
  This is no longer just a personal-tool enhancement list, it's headed
  toward a paid subscription launch in about a month (large-cap framework
  only). Added a full visual redesign, a navigation overhaul, and a rebrand
  pass ahead of the original six enhancement items, which moved to a
  fast-follow tier. Onboarding moved up into the ship-critical tier since
  new paying users will need it. Billing and multi-framework support
  (small/mid-cap, ETFs) are explicitly out of scope for this phase.
- 2026-09-20: Reviewed seven CFA Institute Research Foundation papers
  Freek shared (macro drivers of the stock-bond correlation, Klement's
  geoeconomic-decade thesis, the "Stocks for the Long Run, Revisited"
  debate, a 2015 comprehensive ETF guide, two 2025 ETF evaluation briefs,
  and SBBI's 2021 summary edition). Folded four items into the
  fast-follow tier (11-14 above): SBBI's real historical bear-market
  table for decline-severity/recovery-time context, a methodology-page
  caveat about revisiting fixed thresholds, and two new informational
  flags (liquidity/tradability, earnings-quality-vs-cash-flow). Left the
  ETF-specific evaluation frameworks (expense ratio, tracking
  difference, E-T-F scoring) out of scope for now, they're real and
  useful but belong with the future ETF version of the app, not this
  release, per the scope decision above.
