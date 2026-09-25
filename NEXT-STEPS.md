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

- 2026-09-25: The watchlist-headroom risk logged on 09-21 came true, and is now
  fixed. The 02:00 nightly-scan timed out on 09-24 and 09-25 — killed at the
  ~60s execution ceiling before it persisted anything — so every watchlist
  figure froze at 09-23 while the separate 02:15 universe scan kept running.
  Cause: EDGAR fundamentals rejoined the watchlist pass on 09-21 and pushed it
  from ~40s into the high-40s/low-50s; ordinary provider-latency variance then
  tipped it over 60s. (The 504 in net._http_response is a red herring — that is
  pg_net's ~26s connection timeout and fires every night; the evidence is the
  `cron_runs` rows: `timed_out`, null duration, null watchlist_evaluated.)
  Fixed by slicing the watchlist across requests — the same move as splitting
  the universe scan out. The route takes ?part=i&parts=n and refreshes only that
  index-slice; the first slice also does the once-a-night macro refresh. Three
  pg_cron schedules now (nightly-scan-p0/p1/p2 at 02:00/02:03/02:06), each ~14–19s
  against the ceiling. The digest can no longer ride the pass (no slice sees the
  whole watchlist), so it moved to its own schedule, daily-digest at 02:10, via
  /api/cron/digest, which already assembles it from the stored signals and is
  idempotent per recipient per day; per-ticker buy alerts still fire from each
  slice. Verified on production: all three slices ran ≤19s and 32/32 watchlist
  symbols now carry today's signal, so the frozen figures are current again.
  This closes the 09-21 headroom risk. (Also: the 09-24 stock-page declutter,
  commit 2bda7ec, had not been pushed yet and went live alongside this fix,
  since it sat under it on main.)
- 2026-09-24: Decluttered the stock page back to the ground rule. Items 7-14
  had each been built as its own full section — heading, intro paragraph,
  card — and bolted onto the default view, so a dozen sections plus the
  twenty-card ratio grid stacked on one page. Fixed as layout only; no
  checklist logic, threshold or computed value was touched.
  - **Stayed on the default view:** header, the "why" verdict card, the price
    chart, the nine-condition checklist, AI thesis, qualitative review — plus
    a new short row of five headline ratios (P/E, PEG, ROE, net margin, net
    debt/EBITDA) with a "See all 20 in Full research →" link in place of the
    full grid. Kept the position block here too (see judgement calls).
  - **Moved into Full research, under a new first "Analysis" tab** (now the
    default tab, where both the header "Full research →" link and the
    "See all 20" link land): the full twenty-card ratio grid, the valuation-
    range chart, the growth-trajectory panel, earnings-quality notes and
    analyst estimates. The data-fetching and derived values are unchanged;
    they are computed in research/page.tsx now instead of the stock page, and
    only when the Analysis tab is open, like the other tabs.
  - **Downgraded to inline signals rather than sections:** peer comparison is
    now a one-line caption on the four ratio cards it covers (P/E, ROE, both
    margins), on the headline row and in the full grid; decline-severity is a
    single caveat line under the valuation-range chart; the condition trend
    ("what changed since last time") folds into the checklist as a per-row
    "↑ newly passing / ↓ newly failing" marker plus a "Since {date}:" caption,
    instead of a disconnected block further down.
  - **Judgement calls beyond the brief:** (1) The per-card render logic — PEG's
    two bases, the market-cap currency pair, overridden targets — was extracted
    into one shared `RatioGrid` component used by both the headline row and the
    full grid, rather than copied into two files; copying it would have been
    exactly the two-builders-one-saver split that caused the 09-21 suggestions
    bug. (2) The peer caption reads "vs. the others you follow", not the "vs.
    sector median" wording the brief used, because peerComparison.ts is
    emphatic that this is a watchlist median and never a sector one — calling
    it a sector median would be the one falsehood that module exists to avoid.
    (3) The decline caveat renders the market-level severity sentence (which
    already says "at market level"), dropping the recovery clause and the
    separate index-vs-single-stock note, to hold it to one self-qualifying
    sentence. (4) The position block stayed on the default view although the
    brief's "stays" list did not name it: it is the user's own holding and the
    thing the sell signals are about, not a dense analytical table. Verified in
    a real browser across light and dark and EN/NL, both pages, no console
    errors; full gate clean.
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
- 2026-09-21: Fixed a 404 on every suggestion's stock page. The universe
  scan computed each candidate's ratios and signal in memory but persisted
  only a `suggestions` row (and the fetched `daily_snapshots`); it never
  wrote the `ratios` or `signal_history` tables. The stock page resolves a
  symbol through `getSignal()`, which reads `signal_history`, so every name
  the suggestions feed linked to came back "Not found" — all four live
  suggestions at the time (APH, APP, BR, DECK), not one. The scan now writes
  `ratios` and `signal_history` for the names it files, reusing the exact row
  shapes `runDailyPipeline` uses. Verified on real data with writes
  intercepted: a 40-candidate batch suggested 4 names and all 4 got both
  tables. The four pre-fix suggestions were backfilled through
  `runDailyPipeline` and now resolve on production (they read as `watching`
  rather than the `buy_worthy`/`almost` on their cards — a genuine intraday
  drift from being re-evaluated hours after they were filed, not a fault;
  it does not arise in the nightly flow, where the signal is written in the
  same pass that files the suggestion).
- 2026-09-21: **Known debt, flagged not fixed.** The fix above leaves the
  `ratios` and `signal_history` row-building duplicated between `scan.ts` and
  `runDailyPipeline` — the same rows constructed in two places. This is worth
  unifying into a single shared builder later, when there is no fix under
  time pressure riding on it, and it is called out here specifically because
  this exact duplication is what caused the 404 bug: both paths built the
  rows, only one of them saved them, and nothing tied the two together so the
  gap was invisible. A shared builder would also give the scan's persistence
  a unit-test seam it does not currently have (the live intercepted-write
  check was the only practical verification this time).
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
