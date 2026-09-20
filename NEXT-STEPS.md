# Rich Investor — Next steps for Claude Code

**Status: on hold.** The nightly cron pipeline has been dying silently every
night since 09-18 (scan never starts, suggestions frozen since 09-13).
Instrumentation to catch the failure point is built (commit 3ae3ac3) but not
deployed. Do not start item 1 below until the nightly run has completed
cleanly at least once with the new telemetry in place. See the log at the
bottom for details.

Context: this is v1 of a personal stock-analysis tool built on Supabase, Netlify,
and GitHub. It applies a fixed checklist from the book "Rijke Belegger, Arme
Belegger" to a universe of stocks and tells the user which ones are buy-worthy,
almost there, or still watching. Still for personal use, not yet a commercial
product. Don't add signup, billing, or plan tiers as part of this brief.

## Before writing code

Read through the existing routes (`/`, `/search`, `/suggestions`, `/compare`,
`/stock/:ticker`, `/account`) and the current data providers (yahoo-finance2,
financial-modeling-prep) so you understand what's already wired up. Then come
back with a short plan and flag anywhere a feature below needs a data source,
field, or API tier we don't currently have, before building against it. Confirm
a data gap up front rather than faking or stubbing financial data.

## Ground rules

- The book's own thresholds (P/E ceiling, PEG bands, 50% decline, $10bn floor)
  stay locked and untouched. Only the app-default thresholds in Account are
  ever user-editable.
- Keep the existing dark-mode visual language and the EN/NL bilingual support;
  any new UI needs both languages, not just English.
- The stock page's default view (checklist, chart, AI thesis, qualitative
  review) stays exactly as compact as it is today. Nothing below should add
  visual weight to that default view.

## Build order

### 1. Progressive-disclosure research tab on the stock page

Add a secondary tab or expandable section ("Full research"), separate from the
default checklist view, containing:

- Income statement, balance sheet, and cash flow statement, as many years as
  the data source supports
- A news feed for the ticker
- Links to recent filings
- Earnings call transcripts, if the data source has them

One click away from the default view, never shown by default.

### 2. Onboarding / "how this works" primer

A short walkthrough, reachable from the nav and shown automatically the first
time someone signs in, that explains: what the nine conditions mean in plain
language, why decline-from-high and PEG are checked together, and what
buy-worthy / almost there / watching mean. Add a light-mode toggle alongside
this, since the app is currently dark-only.

### 3. Insider transaction data, wired to the existing catalyst checkbox

Surface each stock's insider buy/sell activity (last 90 days to start). On the
qualitative review section, the "Management is buying its own shares" catalyst
checkbox should show this data next to it instead of asking the user to verify
it elsewhere.

### 4. Earnings calendar

Show the next earnings date on each stock's page. In the daily digest email,
flag when a watchlist name is reporting soon, since that's usually when
"temporary vs structural" actually gets answered.

### 5. The stock's own historical valuation range

Extend the existing price/drawdown chart (or add one alongside it) that plots
the stock's own P/E and/or PEG over its 5-year history, so a user can see
"cheap vs its own typical multiple," not just "down from its 5-year high."

### 6. Peer/sector comparison on the stock page

Add sector-relative context for the key metrics already in the checklist table
(P/E, ROE, margins) against the sector median, using the sector classification
the app already uses for watchlist filtering.

## Working style

Work through these one at a time. After each one, report what was built, what
data source it relies on, and anything left out because the data wasn't
available, rather than moving straight to the next item.

---

## Log

- 2026-09-20: Brief drafted after a competitive gap analysis against Koyfin,
  Finviz, StockAnalysis.com, and Morningstar. Not started yet.
- 2026-09-20: Before item 1 started, an audit of the live system found the
  nightly cron pipeline had been dying silently since 09-18 (watchlist half
  completes in ~18s and writes signal_history; the universe scan never
  starts, so the cursor never advances and suggestions have been frozen on
  the same 4 rows since 09-13). Root cause not yet proven: the process
  appears to be killed mid-scan (suspected function timeout ceiling below
  the 300s the code assumes), not an application error and not the `.or()`
  universe query (measured at ~1.3s, ruled out). Start-of-run telemetry
  (`0032_cron_runs_in_flight.sql` plus begin()/checkpoint()/finish()
  lifecycle) is built, tested, and committed as 3ae3ac3, but not deployed.
  Feature work stays on hold until a confirming run proves the fix and
  names the actual failure point.
