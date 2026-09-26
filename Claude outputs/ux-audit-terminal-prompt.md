# Prompt for the terminal session: work the UX audit punch list

Paste the block below into Claude Code in `~/rich-investor-app`.

---

Read `Claude outputs/ux-audit-2026-09-25.md` in full before doing anything.
It is an outside UX audit of the live app (richinvestor.netlify.app), run on
2026-09-25 against production, in EN and NL, at 1440 px desktop and 390 px
mobile. Section 9 is the punch list: 37 numbered items with severity and
effort. Item numbers below refer to that table.

Treat the audit as input to NEXT-STEPS.md, not a replacement for it. Where the
two conflict, the NEXT-STEPS.md ground rules win until I say otherwise. The
known conflicts are listed under "Needs my decision" below. Don't build any of
those until I answer.

## Before writing code

1. Verify every finding against the current code, not just the audit text.
   Production at audit time did not include the three local commits ahead of
   origin (795f253, 9e80bc1, ad66c20), so some findings may already be moot.
   Mark each item: confirmed / already fixed / can't reproduce.
2. Map each confirmed item to the files it touches.
3. Come back with a short plan grouped as below. Flag any item that needs a
   data field, source or API tier we don't have (search results with market
   cap, for example). Free tiers only; don't add or switch a provider without
   a cost/benefit discussion with me first.
4. Add a dated entry to the Log in NEXT-STEPS.md when you start, and fold the
   accepted items into its build order rather than keeping a second list.

## Group A: fix now (bugs and copy, no design decision needed)

- **5 Search.** Exact ticker match first ("KO" must return Coca-Cola),
  normalise spaces and hyphens ("coca cola" = "coca-cola"), drop warrants,
  certificates and anything under the $10bn floor before display, primary
  listing first. Show market cap per result if the data is already available.
- **6 Narrative logic.** Build the "Why" and Suggestions sentences from each
  condition's pass/fail state, never from a fixed template. Known failures:
  Heineken's ROE fail listed under "WHAT PASSES"; SMCI "-305% of net income"
  called "a sign of clean accounting"; GDDY "The PEG ratio is unknown, above
  the 1.0 ceiling"; "turned buy-worthy today" on names that turned days ago.
  Add a vitest case per condition x state (pass, fail, unknown).
- **10 Data sanity layer.** Outliers render grey "Can't judge reliably"
  instead of pass/fail, as Methodology already promises for missing data:
  ROE above 100%, a year-on-year change beyond +/-60% (Adyen 2022 revenue
  8.9B vs 1.9B), negative cash conversion, unknown PEG. Hide the SEC Form 4
  insider block for non-US filers instead of showing "No reported insider
  trades". Find out why Rollins is mapped to "Luxury goods and consumer
  discretionary" and fix the mapping, not just that one row.
- **11 Freshness.** A stock analysed seconds ago must not say "Updated 17h
  ago". Per stock, show the price's close date and exchange, and the
  financials' period.
- **14 Remove.** Undo toast instead of instant delete; the stock page must
  update its state after removal (it kept saying "on the watchlist").
- **15 Mobile overflow.** The "Filter" button in the watchlist sort row makes
  the page 445 px wide at 390 px. Fix that now; the rest of mobile belongs in
  NEXT-STEPS item 2.
- **17 AI summary.** Hide a summary once the signal it was written against has
  changed, until it is regenerated. Tighten the prompt: no superlatives
  ("fortress", "dirt-cheap", "finally makes sense"), numbers must match the
  page.
- **18 News.** Show a date on every item; hide analyst rating and
  price-target headlines by default.
- **19 Suggestions.** Default sort by conditions met, so a 9/9 is never sixth.
- **Copy and format fixes:** 20 ("1 conditions more", EN and NL plural
  rules), 21 ("requiredr"), 22 ("cheaper than 5% of the last five years"
  reads backwards), 23 (duplicate "What you must check" sentences; "Read the
  full reasoning" repeats the bullets), 24 (one target per metric on screen),
  26 ("$4214.7B" market cap), 27 (stock header breaks when the tradability line
  is long, see GOOGL), 28 (unstyled white inputs in "I own this"), 29 (hide
  empty Filings and Transcripts tabs for non-US listings), 31 (NL calques and
  terms, full table in audit section 8), 37 (language control as text, not a
  flag).
- **Account copy:** delete the NOTIFY_EMAILS sentence; revenue growth
  thresholds say "at or below" and should say "at or above"; "these four"
  sits above five groups.

## Group B: fold into existing NEXT-STEPS items

- **Item 1 and 3, design direction:** audit items 7 (verdict weight and
  values on checklist rows), 35 (four colour roles: met, failed, needs
  attention, informational), 36 (12 px labels, unlabelled sparklines). Check
  against docs/design-notes.md and extend it there first.
- **Item 2, navigation:** mobile bottom tab bar, 44 x 44 px tap targets,
  "Remove" out of the verdict area on mobile (audit section 7).
- **Item 4, rebrand copy pass:** 30 (brand becomes "Rijke Belegger" in NL),
  the jargon rewrites in audit sections 2.3 and 8 ("logarithmic-waterfall
  maths", "high-conviction entry points").
- **Item 5, onboarding:** 13, plus a final "pick three companies you know"
  step that analyses them on the spot.
- **Item 12, methodology page:** the "Why only four sectors?" explainer in
  audit section 5, naming the four sectors.

## Needs my decision (don't build until I answer)

- **1 Public landing page and public demo stock pages.** Not billing, but
  sign-up is out of scope for this build per NEXT-STEPS. Build the landing
  and demo pages now, or later?
- **2 Data source licensing.** Don't change providers. Produce an inventory:
  which fields come from yahoo-finance2, FMP and EDGAR, and what breaks if
  yahoo-finance2 stops working.
- **3 Billing, terms, privacy policy, delete account.** Out of scope for this
  codebase per NEXT-STEPS. Leave it, just confirm nothing here blocks it.
- **4 Rename "Buy-worthy" to "Checklist complete".** Waiting on a legal check.
  Don't rename yet; make sure every status label comes from the i18n files so
  it becomes a one-line change.
- **7 and 12 Stock page order and review gating.** The audit wants the
  checklist directly under the verdict and the qualitative review collapsed
  below 8/9. The ground rule says verdict, chart, AI thesis and review are
  what a user sees first. Propose how to add values to the checklist rows and
  give the verdict weight without breaking that rule.
- **8 Home layout.** "Ready for your review" / "Almost there" / rest, with
  market context reduced to one line. Mock it first.
- **9 Status rule.** The product labels ADBE 8/9 "Watching" and GOOGL 8/9
  "Almost there"; How it works and Methodology say "one or two short is almost
  there". Tell me what the code actually does, then I'll pick the rule.
- **16 Condition 9 editable.** The audit says lock the debt pass mark; the
  ground rules say app-default thresholds stay editable. Alternative to
  consider: keep it editable and stamp "You changed this rule" on every
  verdict it affects.
- **25 "vs. the others you follow".** It is a watchlist median by design
  (peerComparison.ts). The audit's point is the peer set: a median of
  high-ROE mega caps makes a clear pass look weak. Keep, reword or drop?
- **34 Market-crash comparison under the P/E chart.** It came from item 11
  (SBBI table) on purpose; the audit says it nudges toward buying. Keep,
  reframe or drop?
- **Sector rule presentation (audit section 5).** Show the focus sector as a
  separate tag outside the 8 numeric conditions, with a "Follow the book
  strictly" setting on by default?
- **Price trigger and alert.** New feature: for the decline condition, show
  the price at which it passes (5-year high x 0.5, e.g. GOOGL $201.31) and
  offer an email alert. Worth adding to the build order?

## Working style

Same as NEXT-STEPS.md: one item at a time, report what was built and what it
relies on, EN/NL parity for every string, light and dark mode, verify in a
real browser, full gate clean before each commit. Stop and ask whenever
something is ambiguous rather than guessing.
