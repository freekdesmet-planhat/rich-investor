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
- A verdict computed with a user-changed threshold must say so: the affected
  checklist row and the verdict line both show "You changed this rule", and the
  Account page says so when the threshold is being edited. (2026-09-26, launch
  item 5. Condition 9 stays editable.)
- Rebrand the copy: stop citing "(from the book)" scattered through every
  metric tooltip and threshold. The app presents this as its own methodology
  in its own voice. Keep one clear credit to "Rijke Belegger, Arme Belegger"
  somewhere sensible (an About or Methodology page), not removed entirely,
  just not repeated everywhere.
- The stock page order (updated 2026-09-26, launch item 8 — this supersedes the
  earlier verdict / chart / thesis / review order): verdict (a nine-dot ring and
  one headline per state), then the checklist (the value on every row, e.g.
  "Price fall: -68% (needs -50%)"), then the chart, then "Why" collapsed to three
  bullets, then the ratios and the AI summary. Full financials and dense tables
  live behind "Full research". The qualitative review opens at 9/9, shows a
  preview at 8/9, and otherwise collapses to one line; sell signals appear only
  after "I own this"; on mobile the verdict header is sticky.
- The qualitative-review workflow (temporary vs structural, catalysts, sell
  signals, Howard Marks' question) and the "not investment advice" framing
  are core product, not decoration. They survive the redesign in substance.
- Support both light and dark mode from here on, not dark-only.
- Keep EN/NL bilingual coverage for all new and rewritten copy.
- Keep this a single-owner data model, no multi-user support in this phase.

## Launch build order (decided 2026-09-26)

Group A (audit fixes) is done. This is the ordered path to a paid launch. Same
routine per item: gate (vitest + tsc + eslint + build), push one commit, then a
production smoke test — EN and NL, light and dark, mobile at 390px. Free tiers
only; no new/switched provider without a cost/benefit discussion first.

### Quick batch (one commit each)

1. **9/9 relabel.** The 9/9 status becomes **"Checklist complete"** (NL **"Alle
   voorwaarden gehaald"**) everywhere, emails included. The home section holding
   those stocks is **"Ready for your research"** (NL **"Klaar voor jouw
   onderzoek"**). On the stock page: **"Checklist complete: now it's your
   research"**, with a **"Start my review"** button. FLAG: final wording still goes
   to the user's legal check.
2. **Ferrari.** Add a symbolRule for **RACE.MI** (home listing Milan) →
   `luxury_consumer`; `db:sync-sectors` then `db:check-sectors`.
3. **Crash line.** Delete the "17 US market declines since 1870" sentence under
   the P/E chart.
4. **Peer line.** Replace "vs. the others you follow" with the distance to the
   rule's threshold, e.g. **"ROE 22.3%: 7.3 points above the 15% minimum"** (NL
   equivalent).
5. **Changed-threshold disclosure.** Condition 9 stays editable, but any verdict
   computed with a user-changed threshold shows **"You changed this rule"** on that
   checklist row and on the verdict line; the Account page says so when editing it.
   (Ground rule updated above.)
6. **Sector rule = one of the nine, presented calmly.** "Outside the focus
   sectors" shows in neutral grey, not a red ✗; the watchlist section header loses
   its "!" badge. Add a **"Why only four sectors?"** explainer on Methodology and
   behind the sector row, using audit section 5 copy updated to our final
   definitions (four focus sectors; capital-markets = exchanges + data providers
   in, banks/brokers/asset managers out; publishers in as entertainment_media).
   FLAG: leave a placeholder for the study period and source — the user will supply
   them from the book.
7. **Item-4 copy pass** (previously queued): use the app's own vocabulary in the AI
   prompt (condition names + the word "voorwaarde" from i18n; the stock, not the
   price, meets conditions), and refer to the method's limit instead of the stray
   opinion word "erg laag" (e.g. "ruim onder de grens van 2,5").

### Bigger items (in this order)

8. **Stock page, checklist-first.** (Ground rule updated above.) Verdict with a
   nine-dot ring + one headline per state; checklist with the value on every row;
   chart; "Why" collapsed to three bullets; ratios and AI summary. Review opens at
   9/9, previews at 8/9, else one line ("The review opens when a stock meets all
   nine conditions"). Sell signals only after "I own this". Sticky verdict header
   on mobile.
9. **Home screen.** "Ready for your research" (a card per 9/9 stock), then "Almost
   there" (8/9 cards naming the one missing condition), then the rest in a compact
   list sorted by conditions met. Market context → one line; changelog → one line
   with an expander.
10. **Price trigger.** When the decline is a stock's only missing condition, show
    the price at which it passes (5-year high × 0.5, e.g. "Passes below $201.31") on
    the stock page and its Almost-there card, with an opt-in per-stock email alert.
    The nightly price pass checks it → say "checked every night". Deduplicate like
    the other alerts.
11. **Front door.** Public landing page at `/`; three public read-only demo stock
    pages (ASML.AS, HEIA.AS, AAPL) using the new stock page; a "Join the waitlist"
    form. Demo pages: labelled "Demo", figures dated, no AI generate button, no
    review or holdings, "not financial advice" visible, indexable. Landing copy from
    audit section 1, with the cadence line computed live ("We check [N] large
    companies in the four focus sectors about once a week. Your watchlist every
    night."), EN + NL. FLAG: waitlist email collection needs a privacy notice first
    — add a short placeholder page and flag it for the user's legal check. Sign-up
    and billing are out of scope.

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

## Audit fixes (from ux-audit-2026-09-25)

Bug and copy fixes from the outside UX audit (`Claude outputs/ux-audit-2026-09-25.md`),
each verified against current code. Built one at a time, EN/NL + light/dark +
browser-verified + full gate, like everything else. Audit item numbers in [ ].

### A. Fix now — no design decision

- **A1. Search [5].** Filter to Large/Mega market-cap bands (`market_cap_usd` is
  null for all 102k universe rows, so the "≥ $10bn" floor is by `market_cap_band`);
  guarantee the exact ticker and symbol-prefix matches survive the fetch (today
  120 mixed rows are ranked in memory, so name-substring matches bury `KO` →
  Coca-Cola); normalise spaces and hyphens ("coca cola" = "Coca-Cola"); primary
  listing first (ranking already does exact/prefix/derivative/primary); show the
  band per row. Files: `lib/data/queries.ts` (searchUniverse), `lib/data/rankMatches.ts`,
  `app/search/page.tsx`, messages. **Flag: no dollar market cap available** — the
  column is null everywhere, so results show the band, not "$31.5B".
- **A2. Narrative from state [6].** In `lib/signal/explain.ts` the returns and
  cash-flow sentences are pushed as "passes" regardless of the condition's result
  (Heineken's ROE fail under "What passes"; SMCI's −305% as "clean accounting"),
  and "turned buy-worthy today" is unconditional. Build every sentence from the
  condition's pass/fail/unknown state; thread `becameBuyWorthy` through
  `ExplainInput` for the "today" line. Vitest case per condition × state. Files:
  `lib/signal/explain.ts`, `lib/pipeline/evaluateSymbol.ts`, `explain.test.ts`.
- **A3. Copy/typo batch [20,21,22,23,24,31,37 + account].** "requiredr";
  percentile reads backwards ("lower than on 95% of days"); ICU plurals for
  "1 condition more/fewer" (EN+NL); de-duplicate the two temporary/structural
  "check" sentences and the "Read the full reasoning" re-print (`WhyBlock`); show
  only the pass mark on checklist metrics [24]; NL section-8 table [31]; language
  control as text not flag [37]; delete the NOTIFY_EMAILS account line; growth
  labels direction-aware ("at or above"); "these four" → correct count. Files:
  `explain.ts`, `messages/*`, `WhyBlock.tsx`, `RatioGrid.tsx`, `LanguageSwitcher.tsx`.
  **Note [26]** (market cap "$4214.7B") looks already fixed — `formatBillions`
  scales to T; verify in browser.
- **A4. Data sanity layer [10].** Outliers (ROE > 100%, YoY change beyond ±60%,
  negative cash conversion, unknown PEG) render grey "Can't judge reliably"
  instead of pass/fail; hide the SEC Form 4 insider block for non-US filers; fix
  the Rollins → luxury_consumer mapping at the rule level. Files: `lib/ratios/*`,
  `lib/sectors/mapping.ts`, `components/review/InsiderActivity.tsx`, stock/research
  pages. **Note:** Adyen's 8.9B → 1.9B revenue is a gross/net source mix — the grey
  flag hides it; statement-source consistency is a deeper follow-up.
- **A5. Freshness [11].** Per stock: price close date + exchange, financial
  period, "Just analysed" for fresh runs; stop deriving "17h ago" from the as-of
  date at midnight. Files: `components/DataFreshness.tsx`, stock page, queries.
  **Flag: confirm price close date/exchange are available** to display per stock.
- **A6. Remove flow [14].** `RemoveFromWatchlist` already has in-place undo; the
  real bug is the stock page not refreshing its "on the watchlist" state after
  removal. Verify the watchlist-row remove too. Files: `RemoveFromWatchlist.tsx`,
  stock page.
- **A7. AI summary [17].** Hide the thesis once its signal changed (regenerate
  prompt, not stale text with a warning); add "no superlatives, numbers must
  match the figures" to the prompt. Files: `AiThesisCard.tsx`, `lib/ai/thesis.ts`.
- **A8. News + research tabs [18,29].** Date every news item, hide analyst
  rating / price-target headlines by default; hide Filings/Transcripts tabs for
  non-US listings. Files: `app/stock/[symbol]/research/page.tsx`.
- **A9. Suggestions [19].** Default sort by conditions met. Files:
  `app/suggestions/page.tsx`, `lib/suggestions`.
- **A10. Stock header + holdings inputs [27,28].** Verdict/tradability on their
  own rows so a long tradability line can't break the header; theme the "I own
  this" inputs. Files: stock page header, `components/PositionBlock.tsx`.
- **A11. Mobile filter overflow [15].** The watchlist sort/filter row overflows
  to 445px at 390px — fix that one now; the rest of mobile is item 2. Files:
  `app/page.tsx`.
- **A12. Nightly scan skips Mega Cap; header count is wrong.** The scan filtered
  candidates to the `Large Cap` band only, so mega caps were never suggested —
  added Mega Cap. The throughput report that came first killed the original
  "4 slices ≈ 4-week pass" plan: the scan's real domain is **~293 names** (four
  focus sectors, US/Europe, primary listing), not the 3,422 the Suggestions page
  claimed. One nightly slice already re-checks that whole set about every five
  nights, so no new slices and no new schedule were added. The "3,422 screened"
  copy was the same wrong figure, so the header now counts the *exact* cursor
  population via the shared `applyScanScreen`, and cannot drift again. Circuit
  breaker and atomic cursor claim (migration 0039) stay as retry protection.
  Files: `lib/pipeline/scan.ts` (applyScanScreen, Mega Cap), `lib/data/queries.ts`
  (getScreeningProvenance), `app/suggestions/page.tsx`, `messages/*.json`.
- **A1c. Stale size labels self-heal, and search shows the real cap.** ~10% of
  "Large cap" labels are wrong (HelloFresh at $0.39bn), so a user adds a name
  search calls Large cap and the checklist then fails it on size. No new
  provider: wherever a pipeline already fetches a quote (watchlist, scan, adding
  a stock), write the USD market cap back to `universe.market_cap_usd`; in
  search use the real figure when present (show "$31.5B", apply the $10bn floor
  to it) and fall back to the band only when absent; do a one-off quote fetch for
  the ~30 null-band valve rescues so they're findable by name. Over one scan
  cycle the stale labels correct themselves. Built with A12 (both touch the
  scan). Files: `lib/pipeline/evaluateSymbol.ts`/`runDaily.ts`/`scan.ts`,
  `lib/data/searchFilters.ts`, `lib/data/queries.ts`, `app/search/page.tsx`.
- **A12b. Nightly price pass (built 2026-09-26).** Cheap once the domain was
  known to be small. At 02:12 (after the digest, before the scan) it batch-quotes
  the large universe (finance-query `/v2/quotes`, 25/batch — the 293 focus names
  every night, the ~1,042 other Large+Mega on a 1/7 rotation, the 1,616 Mid Cap
  on a 1/28 rotation for upward label correction), ~18–21 requests/night. It
  writes real USD market caps back after each batch (A1c heal, universe-wide,
  partial-safe) and queues any name that has just *crossed* −45%/−50% since its
  last full evaluation. The 02:15 scan drains that queue first, then walks the
  cursor with the budget left; crash-night backlogs spill into later nights.
  Shares the scan's circuit breaker; skips watched names, keeps suggested ones.
  Files: `lib/pipeline/pricePass.ts`, `rotation.ts`, `scanQueue.ts`,
  `scan.ts` (prioritySymbols), `lib/providers/financeQuery.ts` (fetchPriceBatch),
  `app/api/cron/{price-pass,universe-scan}/route.ts`, migration
  `0040_price_pass.sql` (scan_queue + schedule_price_pass).

Order (2026-09-25): A11 → A9 → (A12 + A1c together, headroom/throughput report
first). Deploy policy: push after each verified item with a production smoke
test, not batched — see the Log for why batching bit us on 09-24.

**Cadence (landing-page line, from A12):** _"Every large company we cover is
re-checked about once a week; your watchlist every night."_ Concretely: one scan
slice/night walks the ~293 focus-sector large caps in about five nights; the
watchlist runs nightly in its 02:00–02:06 slices. Use this sentence on the
landing page, not "3,422 screened tonight".

### B. Folded into the shipped items above (audit refinements)

- **Item 1/3 (design):** verdict weight + values on checklist rows [7], four
  colour roles [35], 12px labels / unlabelled sparklines [36] — extend
  `docs/design-notes.md` first.
- **Item 2 (navigation):** mobile bottom tab bar, 44px tap targets, "Remove" out
  of the verdict area on mobile [§7].
- **Item 4 (rebrand copy):** NL brand "Rijke Belegger" [30]; jargon rewrites
  ("logarithmic-waterfall maths", "high-conviction entry points") [§2.3, §8] —
  handle alongside the NL calques in A3, since they are the same lines in
  `explain.ts`.
- **Item 5 (onboarding):** [13] plus a final "pick three companies you know"
  step that analyses them on the spot.
- **Item 12 (methodology):** the "Why only four sectors?" explainer naming the
  four [§5].

### Blocked on a decision (do not build until answered)

Landing + demo pages [1], data-source inventory [2], billing/legal [3], rename
"Buy-worthy" [4], stock-page order + review gating [7,12], home layout [8],
status rule [9], editable condition 9 [16], "vs. the others you follow" [25],
market-crash comparison under the P/E chart [34], sector-rule presentation,
price-trigger + alert.

Dependency on **sector-rule presentation** (audit §5): the nightly scan only
walks the four focus sectors, which is what keeps its domain at ~293 names. If
the parked "Follow the book strictly (sector rule off)" toggle ever ships, the
scan's `applyScanScreen` focus filter must widen with it, and the "we check 293
companies" copy plus the ~weekly cadence recompute from the wider domain —
otherwise suggestions never surface the out-of-focus names the toggle allows.

## Working style

Work through these one at a time. After each one, report what was built,
what data source or design decision it relies on, and anything left out
because of a gap, rather than moving straight to the next item. You don't
need to wait for a go-ahead between items, but stop and ask whenever
something is genuinely ambiguous rather than guessing, especially on design
direction and on any data-source gap in items 7 or 8.

---

## Log

- 2026-09-26: Round 2 item 7 **review fixes** (direction approved; fixes on the
  stock page before rollout, on a **preview deploy**). Eight points:
  1. **Dark mode now follows the toggle, not the OS.** Added `@custom-variant dark`
     in globals.css bound to the `data-theme` attribute (forced dark, or system
     dark when no `light` override) — the exact mirror of the token scopes. This
     fixes both directions (OS dark + app light, and the reverse). Replaced the raw
     `emerald/amber/rose/sky` palette across the app with the semantic tokens
     (`pass/fail/near/accent` + `-wash/-line`) so there is one source of truth;
     stripped the now-redundant `dark:` duplicates. A Playwright theme check is
     added (see below).
  2. **One filled button per screen.** "Save review" → black `primary`; "I own
     this" → outline; selected review chips → ink outline + light tint; the default
     "Not yet assessed" chip now reads as unselected. Blue is links/focus/chart only.
  3. **Failed rows stand out.** A failed checklist row shows the fail colour on
     icon + value and the words "Not met"; a can't-judge/grey row shows a "?" icon,
     muted text and "Can't judge". Reads in greyscale (icon shape + words).
  4. **One price.** The whole stock page now reads the latest stored close (with
     its close date on the freshness line): header, checklist drawdown, chart
     end-point, drawdown and position return. The header previously showed a live
     quote while the chart used the close — hence €875.50 vs €843.50 and −68% vs
     −69.3%. (UI-side unification; a pipeline note is below.)
  5. **Contrast.** `--ink-subtle` darkened to clear 4.5:1 on surface; provenance
     text ("(core methodology)", "market closed", freshness) moved off `--ink-faint`
     (2.4:1) onto `--ink-subtle`. Chart labels ("5y high", "−50% line", axis) → 11px
     in the muted ink token; reference lines neutral, price line the accent.
  6. **Colour roles.** Sparklines draw in neutral ink (trend, not verdict); ratio
     status dots now carry "Met"/"Not met"/"Can't judge" aria-labels, not "green".
  7. **Warm dark palette.** Dark neutrals shifted from cool navy to warm (base
     ~#131210), same contrast rules, so light and dark feel like one product.
  8. **Group A leftovers on ADYEN.AS:** the Why block no longer prints two
     "what to check" sentences that both point to the review (generic handover is
     suppressed when a specific check exists); the 5-year high in the Why prose now
     carries its currency (was a bare "2745.00"). Why-parts are stored, so ADYEN was
     re-analysed to refresh them. ("logarithmic-waterfall maths" / "high-conviction
     entry points" wording deferred to the item-4 copy pass, per the brief.)
  - FOLLOW-UP (noted, not blocking): the nightly pipeline still stores the drawdown
    value and header price from the live quote; the page overrides the display.
    Aligning the pipeline (engine drawdown + `daily_snapshots.price`) on the close
    would make every surface consistent without the UI override, but needs a nightly
    re-run to backfill. The digest email prose also still prints the high without a
    currency (its `NotifiableSignal` carries none); low priority.

- 2026-09-26: Round 2 item 7 (light-first design) — tokens + stock page shipped,
  **STOPPED for review before rollout** (per the brief). New tokens in
  docs/design-notes.md + globals.css: white page, warm off-white panels (#faf8f4)
  with thin light borders, warm near-black ink, one accent (#2563eb), and a black
  `primary` button fill (inverted to light in dark). Applied to the stock page
  (primary CTA now black). Verified ADYEN.AS desktop light/dark + mobile light.
  Awaiting approval to roll the language out to nav/home/etc. (item 8).
- 2026-09-26: Round 2 (click-through + pricing) items 0–6 shipped, one commit each,
  prod-verified. **0** — price-alert: "entry level"→"50% line"/"50%-grens" on chart,
  ratio card and alert; subject leads with the company name ("ASML fell below €X: the
  price-fall condition now passes" / NL), body adds the nightly re-check; one email
  per event (skip the price alert if a Checklist-complete alert already went out that
  day); alert copy flagged FOR LEGAL. **1** — research tabs switch with router.replace
  so one Back leaves research; "Back to the analysis" and "Full research" already
  direct/analysis. **2** — statement tables run oldest-left→newest-right, open scrolled
  to the newest, sticky row label. **3** — light/dark toggle in the header + System/
  Light/Dark in Account; cookie for no-flash SSR + localStorage + settings.theme
  (0048); new default light (moves to avatar menu in item 8). **4** — How it works +
  Methodology merged into one page/nav item (four-step idea → nine conditions → four
  sectors → why rules don't change → credit); /methodology redirects; primer is the
  same page with ?step=. **5** — any company analyses on demand from its stock page
  (opened from search, not auto-added; "Add to watchlist" on the page; stored for
  instant repeat; /api/analyse opened to the whole universe). **6** — Compare any
  company via a shared SearchBox (/api/search), on-demand analysis per pending column,
  names on chips + column headers. Flags: item 0 alert copy for legal; item 10 will
  make Compare's cap and on-demand analyses plan-based. **Next: item 7 (light design,
  stock page) — STOP to show before rollout.**
- 2026-09-26: Pre-traffic safety items shipped and prod-verified. **1** — landing +
  demo pages carry `noindex` and robots.txt is `Disallow: /` until `PUBLIC_INDEXING`
  (default false) is set; the demos show finance-query data whose display licence is
  unsettled. (Also fixed the middleware to let /robots.txt + /sitemap.xml through.)
  **2** — waitlist gated behind `WAITLIST_OPEN` (default false): landing shows
  "Opening soon", `joinWaitlist` refuses to write, no email collected under a
  placeholder notice. Confirmed the waitlist table is empty — nothing was collected
  since item 11 went live. **3** — one-off E2E of the price-trigger email
  (`npm run test:price-alert`, not in cron): sent EN ("ASML.AS passed your entry
  level") and NL ("ASML.AS is onder jouw instapniveau gezakt") to the test account
  via Resend (not simulated), and confirmed the (recipient, kind, symbol, as_of)
  index blocks a second send; test rows cleaned up. `PUBLIC_INDEXING`/`WAITLIST_OPEN`
  are set on Netlify to flip each on when ready.
- 2026-09-26: Launch bigger items (8–11) shipped, one commit each, all prod-verified
  EN+NL / light+dark / mobile. **8** — stock page reordered to the decision path
  (verdict → checklist → chart → Why → ratios/AI → review): a nine-dot VerdictRing
  with one headline per state (sticky under the nav on mobile), the measured value
  on every checklist row, review gated (9/9 opens, 8/9 previews, ≥2-short collapses
  to one line), sell signals only after "I own this". **9** — home leads with
  "Ready for your research" and "Almost there" cards, then a compact list sorted by
  conditions met; market context and the changelog collapse to one line + expander.
  **10** — when the 50% decline is the last open condition, "Passes below <price> ·
  checked every night" + an opt-in nightly email (price pass checks the crossing,
  confirms via the last evaluation that the decline was the sole miss, dedups by
  the price_alert kind); migrations 0045/0046. **11** — public landing at "/" (with
  a live cadence count from the real scan domain), three read-only demo pages
  (/demo/ASML.AS, HEIA.AS, AAPL; anything else 404s), a waitlist (service-role,
  RLS-closed; migration 0047) and a /privacy placeholder flagged for legal. Middleware
  opens "/", /demo, /privacy; everything else stays gated. **Launch build order
  complete.**
- 2026-09-26: Launch quick batch (items 1–7) shipped, one commit each, all prod
  smoke-tested EN+NL. **1** — 9/9 verdict renamed "Checklist complete" / "Alle
  voorwaarden gehaald" everywhere incl. emails; stock page gains a "Start my
  review" CTA to the review section. **2** — Ferrari RACE.MI → luxury_consumer,
  synced (db:check-sectors clean). **3** — market-decline "since 1870" line removed
  from under the P/E chart, declineHistory module retired. **4** — ratio caption is
  now distance to the rule's threshold ("7.3 points above the 15% minimum"); the
  watchlist-peer feature (comparePeers, getSectorPeerRatios, PeerComparison) is
  retired. **5** — a verdict on a user-changed threshold shows "You changed this
  rule" on the debt row + verdict line + Account note. **6** — outside-focus reads
  neutral grey (no red ✗, no "!" badge); "Why only four sectors?" explainer on
  Methodology (#four-sectors) + linked behind the sector tag, final sector
  definitions, study-period/source placeholder (legal flag). **7** — AI prompt uses
  the app's condition vocabulary (voorwaarde + CONDITION_LABEL names, the stock not
  the price) and states figures against the method's limit, not opinion words.
  Next: bigger items 8–11.
- 2026-09-26: Launch build order decided (see "Launch build order" section near the
  top). Quick batch items 1–7 (one commit each), then bigger items 8–11 in order.
  Two ground rules updated: the stock-page order is now verdict → checklist → chart
  → Why(3 bullets) → ratios/AI summary (item 8), and a user-changed threshold must
  be disclosed on the checklist row + verdict line + Account (item 5). Legal-check
  flags recorded on items 1, 6 (study period/source placeholder), and 11 (privacy
  notice).
- 2026-09-26: A10 (stock header + holdings inputs) shipped and visually verified on
  prod (dark mode). 27: identity (ticker + price) and the verdict pill now share one
  bounded top row; the chips, the tradability line and the research link drop below
  full-width, so a long tradability line (GOOGL) can no longer push the verdict out
  of the header — verified GOOGL: ticker and pill both at y=121. 28: the "I own this"
  fields dropped their hard-coded `bg-white` for a themed FIELD style, and
  `color-scheme` is now set per theme in globals.css, so the native date picker and
  scrollbars follow dark mode — verified date input bg rgb(2,6,23), root
  color-scheme dark. Files: stock page header, `components/PositionBlock.tsx`,
  `app/globals.css`. **This completes Group A (A4→A3→A7→A8→A5→A6→A10).**
- 2026-09-26: A6 (remove flow) shipped and browser-verified on prod. Add/remove
  now also `revalidatePath('/stock/<symbol>')`, so the stock page no longer keeps a
  stale "on the watchlist" state after a removal elsewhere. That revalidation
  re-renders the current page too, which would have unmounted the just-shown
  "Removed · Undo" — so RemoveFromWatchlist gained a `member` prop, its membership
  gate moved inside (after the removed/restored branches), and it is now mounted
  unconditionally on the stock page. Verified: same-page undo survives the
  re-render; watchlist-row remove works; a real navigation to the stock page after
  removal shows no Remove. (Browser back/forward can still show a bfcache snapshot —
  that is a browser feature outside revalidatePath's reach, not a state bug.)
  Files: `app/watchlist/actions.ts`, `components/RemoveFromWatchlist.tsx`, stock
  page, `app/page.tsx`.
- 2026-09-26: A5 (freshness) shipped and smoke-tested on prod. The stock-page
  footer's "Updated 17h ago · As of <date>" is replaced by three plain lines:
  the age from `signal_history.created_at` (the real instant, so a fresh run reads
  "Just analysed" not "17h ago"), "Price: close of <weekday date> (<venue name>)"
  from the newest `price_history` date + `lib/data/exchangeNames.ts`, and
  "Financials: annual report <year>" from the newest annual statement's endDate.
  The top stale-pipeline banner is unchanged (that is a days question, still reads
  `as_of`). Files: `lib/data/stockFreshness.ts` (+test), `lib/data/exchangeNames.ts`,
  `lib/data/freshness.ts` (hoursSince), `components/StockFreshness.tsx`, stock page.
  Prod: AAPL "close of Fri 25 Sept (Nasdaq)"; ADYEN.AS "close of Thu 24 Sept
  (Euronext Amsterdam)"; both "annual report 2025"; old "As of" line gone.
- 2026-09-26: A8 (news + research tabs) shipped. News items are dated (kept), and
  analyst rating / price-target headlines are hidden (`isAnalystRatingHeadline`) — a
  rating is a recommendation this app does not surface. The analyst **price target**
  is dropped from the estimates block (forward EPS/growth/analyst-count stay, since
  the PEG is built from them). Filings and Transcripts tabs are hidden for a non-US
  listing (US-venue check; a direct URL to a hidden tab falls back to Analysis). The
  ratio-card history label is now "Last {count} years" / "Afgelopen {count} jaar",
  derived from the years actually shown (the folded-in fix).
- 2026-09-26: Parked for the **item 4 copy pass** (thesis vocabulary, not done yet):
  1. The summary should use the app's own words. The UI says "voorwaarde" and names
     each condition; the summary says "criteria", "regel", "norm", "grens". Pass the
     condition names and the word for "condition" from the i18n files into the prompt
     so both use the same words — and it is the stock that meets conditions, not the
     price ("Daarmee voldoet het aandeel nu niet aan alle voorwaarden").
  2. One stray opinion word: "met 0,27 erg laag". Same rule as valuation — refer to
     the method's limit instead, e.g. "ruim onder de grens van 2,5".
- 2026-09-26: A7 (AI thesis) shipped, with the agreed guardrails.
  - **Prompt:** rewritten for beginners — no investor names ("Peter Lynch" gone),
    no superlatives, no buy/sell language, no price targets; and it states every
    number must be one of the given figures.
  - **Numbers check in code** (`unmatchedNumbers`): the finished summary is validated
    against the exact user message (targets, the N-of-M count, every metric value);
    a fabricated figure discards it. The route now buffers the generation, validates,
    retries once, and shows nothing on a second failure — so text is never shown
    before it passes (streaming-then-discard avoided).
  - **Hide on signal change:** the summary stores the verdict it was written against
    (`signal_status`, `signal_conditions_met`, 0044); the page hides it when either
    moves and offers to regenerate — no stale text behind a warning (the old
    as-of-based staleNotice is gone).
  - **Language + date:** already per-language; a "Figures as of {date}" caption now
    sits under the summary (EN + NL).
  - Also shipped this round: brand → "Rich Investor" in both languages (book title
    kept only on the Methodology credit line); scan buy-worthy suggestions now fire
    the same alert as the watchlist, deduped per ticker/day.
- 2026-09-26: A3 (copy/typo batch) shipped. "requiredr" fixed; ICU plurals for
  "1 condition more/fewer" (EN+NL); the valuation percentile that read backwards
  reframed to "lower/higher than on N% of days"; WhyBlock's redundant full-reasoning
  expander removed and the two temporary/structural check sentences de-duplicated;
  checklist metrics show one target (the pass mark), not two; language control is
  text not a flag; NOTIFY_EMAILS removed from settings copy; growth threshold bands
  read "at or above"; "these four" made count-neutral. NL section-8 calques applied
  (bull/bear, "Ik bezit dit aandeel", "Zoek een bedrijf", "Dagelijkse update", "kan
  de app niet", luxury-sector wording, gehaald consistency, "Nog afwachten"); EN+NL
  drawdown jargon ("logarithmic-waterfall", "high-conviction") dropped; ROE-help
  stray quote fixed and translations re-seeded. Note [26] (trillions) confirmed
  already handled. Deferred: the "Afgelopen 5 jaar"/four-years label (windowing) and
  the NL brand decision (item 4).
- 2026-09-26: A4 sector follow-ups round 2.
  - RELX (REL.L), Wolters Kluwer (WKL.AS), Informa (INF.L) pinned in as
    entertainment_media (publishing/information, like NYT and S&P/Moody's). Tradeweb
    (TW) in as financial_services_non_bank (marketplace operator); HOOD/IBKR stay out.
  - FER (Ferrovial) out — its Nasdaq row is mislabeled "Electronic Equipment/IT"; it
    is toll-road/construction infrastructure (FER.MC is correctly Transportation
    Infrastructure, already out).
  - **Listing rule generalised.** `scanVenueFilter` now admits any US-venue listing
    plus any European-venue listing of a non-US-domiciled company — so a Swiss name's
    Paris line (STMicroelectronics) is available — while still excluding US names'
    thin foreign cross-listings. The collapse prefers, in order: home-country line;
    then, among equal-priority venues with no home line, the home-region (EUR)
    currency; so STM → STM.PA (EUR), ASML → ASML.AS, but ACN/NXPI keep their NYSE/
    Nasdaq primary over a thin Frankfurt/Vienna EUR line. Vienna/XETRA/Milan demoted
    as cross-listing hubs (they still win as a home venue on the home tier).
  - Domain now **249 distinct companies**; unique symbols, no company duplicates; no
    watchlist/suggestion verdict changes.
- 2026-09-26: A4 parked-sector decisions + follow-ups.
  - **Telecom/cable out, per name** (no industry rule for "Diversified Telecom",
    which also holds Alphabet/Meta/NYT/Omnicom). Removed that industry rule; carriers,
    towers, satellite and cable pinned out by symbol (T, VZ, TMUS, TEF.MC, ORA.PA,
    KPN.AS, SCMN.SW, TEL.OL, TELIA.ST, TIT.MI, DTE.DE, CLNX.MC, ASTS, SATS, CHTR,
    CMCSA); internet/media/advertising pinned in (GOOGL, META, PINS, PRX.AS, SCHA.OL,
    OMC, PUB.PA, WPP.L, NYT, SPOT). **Flagged for review (professional-information,
    dropped for now, awaiting your call):** REL.L (RELX), WKL.AS (Wolters Kluwer),
    INF.L (Informa).
  - **Capital markets:** exchanges + data/ratings/index in (ICE, CME, NDAQ, CBOE,
    LSEG.L, DB1.DE, ENX.PA, SPGI, MCO, MSCI, FDS, MORN); asset managers, investment
    banks and bank-chartered brokers stay out. Review CSV:
    Claude outputs/capital-markets-review.csv (53 names: 9 in, 41 out, 3 flagged).
    **Flagged for your call: HOOD (Robinhood), IBKR (Interactive Brokers), TW
    (Tradeweb).**
  - **US-listed foreign domiciles in** (scanVenueFilter: home-country primary OR a
    main US venue; collapse keeps the home line on a dual listing). Adds 11 clean
    names — ACN, ARM, CRCL, FER, GRMN, NXPI, ONON, SPOT, STM, STX, TEL — no
    cross-listing flood, unique symbols.
  - **Sector sync in deploy (item 4):** sync-sector-rules.ts is now a full reconcile
    (DB := code, so removals go live too); `npm run db:sync-sectors` in the deploy
    routine, `npm run db:check-sectors` as the smoke check that fails on drift.
  - **Per-name:** GPN -> financial_services_non_bank. Ticker rename map (lib/data/
    tickerRenames.ts: FISV->FI, FLT->CPAY, NLOK->GEN) wired into import-universe.
    Null-band focus backfill: WISE.L capped at $11.3bn (searchable); ENX.PA returned
    no market cap from the provider (a real gap).
  - Domain now **~241 distinct companies**. Verdicts: only CMCSA moves (intended,
    cable-out); no unintended watchlist/suggestion changes.
  - **Later item:** refresh the universe import (applies the rename map + drops the
    stale FISV/FLT/NLOK rows properly).
- 2026-09-26: A4 decisions round (ROE rule, universe cleanup, sector fixes).
  - **ROE judged on equity, not a 100% cap.** Demote ROE only when equity is
    negative or under 5% of assets in a window year (GDDY 3%, SBUX negative stay
    unjudged); AAPL/MA/NVDA (149/241/117%) get their pass back. Before/after audit:
    nothing newly buy-worthy. APP is `watching 7/9` in every variant — its ROE
    isn't demoted (healthy equity) but `returns` fails on 5y consistency and
    lynch_category fails; ROE was never its binding constraint.
  - **Universe cleanup.** One shared `keepDistinctCompanies` (instrument filter +
    venue/share-class collapse) now runs in the scan as in search; dead tickers
    retire via a no-quote streak (0043). Domain: 293 raw rows -> 254 distinct.
  - **Sector fixes.** 10 wrongly-in-focus + 3 bank-charter names to outside_focus,
    10 relabels — via symbolRule, synced to the DB with scripts/sync-sector-rules.ts
    (the pipeline reads sector_mapping, not the code default). Domain: 254 -> **241**.
  - **Missing names (item 4, explained, not changed):** ACN/SPOT/ARM are in focus
    but excluded by the primary-listing pairing (US-listed, foreign-domiciled —
    NYQ/Ireland, NYQ/Luxembourg, NMS/UK); the capital-markets group (SPGI, MCO, ICE,
    CME, MSCI, LSEG.L, DB1.DE, BLK, BX) is out because "Capital Markets" isn't in
    the financial focus industries (confirmed: only Consumer Finance + Diversified
    Financial Services) — a parked decision; GPN is misfiled "Professional
    Services"; FI (Fiserv) isn't in the universe (still listed as FISV); ENX.PA/
    WISE.L are null-band. Pending: **A-scan-alerts** (fire the buy-worthy email on
    scan finds too, deduped) after A3; **item 6** residual provider-gap count after
    the cleanup settles.
- 2026-09-26: A4 verification pass — two silent-verdict-change fixes.
  - **Grey never makes a stock easier to pass.** The first cut marked a demoted
    condition non-applicable, which *removed* it from the count — a stock with a
    grey condition could get to buy-worthy on fewer conditions. Corrected: a
    sanity-demoted condition stays applicable and is NOT met (`unjudged`), capping
    the stock at "almost", and the status line names it ("8 of 9 met · 1 can't be
    judged: returns"). Before/after audit of 43 watchlist + suggestion names:
    NEWLY buy-worthy = **none**; GDDY 9/9→8/9 (ROE 443%), and Apple/Mastercard/
    Nvidia (ROE 149/241/117%) drop `returns` to unjudged — real but buyback-
    distorted, correctly capped per "buy only when every condition is met".
  - **Growth test is now consistency, not size.** The ±60% rule would have demoted
    real hypergrowth (Nvidia +114%). Replaced with `revenueInconsistent`: flag a
    >60% revenue move only when gross profit moves the opposite way or barely
    follows (Adyen −79% rev / +22% GP), applied in the engine where the gross-
    profit series is at hand. eps_growth no longer size-tested.
  - **Pence UK names now convert (÷100), not grey.** `priceDivisor` normalises a
    GBp price to pounds so P/E and PEG work; cap stays on the major-unit rate. 10
    of the 293 focus names are pence-quoted (INF/REL/WPP/AVV/SGE/BRBY/CPG/ENT/IHG/
    NXT .L). Focus universe exported to Claude outputs/focus-universe-2026-09-26.csv
    for a sector spot-check.
- 2026-09-26: A4 (data sanity layer) built.
  - **Sanity layer** (`lib/ratios/sanity.ts`): out-of-range values are demoted to
    grey "can't judge reliably" before the signal and stored rows are built — ROE/ROA
    above 100% (the 443%-that-passes bug), a YoY change beyond ±60% (Adyen's −79%
    gross/net source mix), a negative cash conversion (the −305% "clean accounting").
    Raw figure kept in `detail.rawValue`. The `returns` and `cash_flow` conditions
    become non-applicable (not a false pass/fail) when their driver is demoted.
  - **Insider block hidden for non-US filers**: secInsider returns `usFiler`; the
    block renders nothing when false, instead of "No reported insider trades" — a
    false all-clear for a company that files no Form 4. Cached via a new
    `insider_activity.us_filer` column (0042).
  - **GBp in the ratio engine**: market cap now converts on the major-unit rate
    (`capCurrency`, shared with the price pass), so a UK name gets its cap and size
    condition instead of failing on missing data. Price-based ratios stay grey for a
    pence quote (honest, not wrong) — full pence handling is a separate follow-up.
  - **Rollins mapping**: `symbolRule('ROL', 'outside_focus')` overrides
    FinanceDatabase's misfiling of it under Hotels/Restaurants/Leisure. Verified BKNG
    (real hospitality) still resolves luxury_consumer.
  - **Verified already-fixed** against current code: the PEG "unknown, above the 1.0
    ceiling" sentence (explain.ts now gives proper unknown-cause clauses). Adyen's
    gross/net revenue source mix remains a deeper follow-up (the grey flag hides it).
- 2026-09-26: A12b follow-ups.
  - **Missing caps diagnosed.** Of 473 priced, 100 got no cap: 54 no market-cap
    in the response (secondary classes GOOGM/DISCB, preferreds, delisted), 30 no
    quote at all (dead tickers like EA post-buyout), 16 all GBp. Only the GBp set
    was a bug — LSE pence quotes whose cap is in GBP but has no USD rate; fixed
    (caps 373→389). Dutch/Belgian coverage was already fine (AMS 1 miss, BRU 0).
    The ratio engine has the same latent GBp gap → folded into A4.
  - **Digest moved 02:10 → 02:20**, after the 02:15 scan, so a name the scan
    finds tonight is in tonight's digest, not tomorrow's. Order is now watchlist
    (02:00/03/06) → price-pass (02:12) → scan (02:15) → digest (02:20).
  - **Alert scope confirmed:** only the watchlist pass (`runDaily`) fires the
    "turned buy-worthy" email, on a crossing. The scan files suggestions but sends
    no alert, so a scan-found buy-worthy name reaches users via the feed + digest,
    not the instant email. (Left as-is; flag if we want scan finds to alert too.)
  - **Pending (tomorrow):** check cron_runs for the first unattended night with
    the price pass — the price-pass row (duration/requests/caps/queued), how many
    queued names the scan drained, and the watchlist + digest rows.
- 2026-09-26: A12b (nightly price pass) built. At 02:12 it batch-quotes the large
  universe cheaply (finance-query `/v2/quotes`, verified to hold at 25/batch):
  293 focus names nightly, ~1,042 other Large+Mega on a 1/7 rotation, 1,616 Mid
  Cap on a 1/28 rotation (upward label correction) — ~18–21 requests/night. It
  writes USD market caps back after each batch (A1c heal, universe-wide,
  partial-safe) and queues names that just *crossed* −45%/−50% since their last
  full evaluation. The 02:15 scan drains `scan_queue` first, then the cursor with
  the remaining budget; a crash night spills into later nights instead of blowing
  the price pass. Shares the scan's circuit breaker; skips watched, keeps
  suggested. New: `pricePass.ts`, `rotation.ts`, `scanQueue.ts`, `price-pass`
  route, migration 0040. **Data-inventory note (blocked item 2):** quotes come
  from the self-hosted finance-query, not `yahoo-finance2` directly; if it scrapes
  Yahoo upstream the licensing point applies to it too, and its host IP carries
  the single-IP exposure. Noted in the audit; nothing changed.
- 2026-09-26: A12 + A1c shipped.
  - **A1c (self-healing size).** `evaluateSymbol` now returns `marketCapUsd`, and
    `runDaily`/`scan`/on-demand write it back to `universe.market_cap_usd` via
    `writeMarketCaps`. Search floors and labels on the real figure when present
    (`passesSizeFloor(band, cap, isExact)`, shows "$46.5B"), band as fallback.
    One-off `scripts/backfill-valve-caps.ts` seeded 29/32 null-band valve names —
    confirmed the heal in both directions: AZO $46.5bn / HON $67.4bn / BX $141.6bn
    now surface by name, while STNE $2.1bn / EEFT $2.5bn / CABO $0.08bn are now
    correctly dropped below the $10bn floor even on an exact ticker.
  - **A12 (scan).** Added Mega Cap to the scan band filter. The
    headroom/throughput report changed the plan: the scan's real domain is ~293
    names (four focus sectors, US/Europe, primary listing), not 3,422 — the live
    cursor confirmed it (wrapped at 265 Large-only on 09-25). One slice/night
    re-checks the whole set in ~5 nights, so no new slices/schedule were added
    (dropped the planned 4-slice migration 0040). Circuit breaker + atomic cursor
    claim (0039) kept as retry protection. Per-slice headroom: 48/60s used, ~12s
    spare. Function runtime ~135s/night ≈ ~1.1 hrs/month — nowhere near any tier.
  - **Header drift fixed.** Both the scan candidate fetch and the Suggestions
    "we check N" count now run through one `applyScanScreen`, so the page shows
    293 (the true cursor population) and can't drift from what's scanned. Audit
    repo copy (Bottom line, §1 Live proof strip, §3 Works) corrected off 3,422.
  - Cadence line recorded above for the landing page. Sector-rule dependency
    logged next to the parked §5 decision. Next: A12b (price pass) — build after
    smoke test, with the nightly request count and yahoo batch-quote feasibility.

- 2026-09-25: Deploy policy set — push after each verified item with a
  production smoke test, not batched. Batching is what put the stock-page
  declutter (2bda7ec) live unplanned under the 09-24 nightly fix, and left the DB
  on migration 0038 while the code that uses it sat unpushed. Also decided A1c
  (stale "Large cap" labels self-heal: pipelines write the real USD cap back to
  the universe, search shows and floors on the real figure, band is the
  fallback) and A12 (add Mega Cap to the scan) — built together, both touch the
  scan, headroom/throughput report first. Order from here: A11 → A9 → A12 + A1c.
- 2026-09-25: A1 (search) pre-build investigation, per the decision to floor
  search on the `Large Cap` + `Mega Cap` bands.
  - **Band edge, checked against real USD caps** (195 names that carry both a
    stored `daily_snapshots.market_cap_usd` and a universe band): the lowest cap
    labelled Large Cap is HFG.DE at **$0.39bn** (HelloFresh — a badly stale
    label; it was a genuine large cap in 2021 and has since collapsed). No Mid
    Cap names have a stored USD cap, because the scan only evaluates the Large
    Cap band, so there is no data on the Mid/Large boundary from below. **19 of
    195 (~10%) Large-Cap labels are under $10bn today** — stale, as expected for
    a static dataset. The band is a coarse pre-filter only; the checklist's
    real-USD `market_cap` condition stays the authority and fails these on the
    actual number. Good enough to floor search on.
  - **Null-band US-primary rows (232).** Overwhelmingly not companies: warrants
    (`-WT`), SPAC units (`-UN`/`U`), preferred shares (`-P*`), rights
    (`-RI/-RW`), and NASDAQ test tickers (`ZJZZT ZVZZT ZXZZT ZWZZT ATEST NTEST
    CTEST MTEST PTEST-*`). But a real-large-cap subset would be wrongly hidden by
    the floor and is exactly what addition-2's exact-ticker safety valve exists
    to rescue: **AZO, BX, HON, COF, OKE, JLL, VOD, EEFT, EXPO, FWONA, FWONK, RBA,
    STNE, SNEX, CABO, STEP, SHO, SITE, MOFG, PGC, OGS, HAE, TDS, IRS, OMF, OLP,
    KINS, LEVL, WSR, PS, SRI, VERI** (~30). Consequence for A1: the hard-drop
    (warrants/units/rights/preferred/structured/test tickers) must run **before**
    the null-band safety valve and must also match symbol suffixes, since these
    rows frequently have null names.
- 2026-09-25: Took in an outside UX audit (`Claude outputs/ux-audit-2026-09-25.md`,
  37 items, run against production before the three unpushed architecture commits).
  Verified every Group A finding against current code and folded the accepted ones
  into the build order under "Audit fixes" rather than a second list; Group B items
  are annotated onto the shipped items they refine, and the "Needs my decision" set
  is parked there unbuilt. Verification highlights: most Group A findings still
  reproduce; a couple are already moot (market cap now scales to T via
  formatBillions; RemoveFromWatchlist already has undo — the live bug is the stock
  page not refreshing after removal). Two data limitations found and flagged, not
  worked around: `market_cap_usd` is null across all 102k universe rows (only
  `market_cap_band` is populated), so search can filter and label by band but
  cannot show a dollar market cap without a provider field we do not collect; and
  the "KO" / "coca cola" search miss is a fetch-order bug (120 mixed rows ranked in
  memory bury the exact ticker) plus missing hyphen/space normalisation, not a
  ranking bug. Freshness shows "17h ago" on a fresh stock because it measures from
  the as-of date at midnight, not the analysis timestamp. No code built yet —
  holding for the decision answers and the two data-limitation confirmations before
  starting Group A one item at a time.
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
