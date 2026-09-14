# Rich Investor

A private stock-analysis tool built on the framework from *Rijke Belegger, Arme
Belegger* (Lennart Remeijsen). It recalculates ratios daily, explains what each
one means, and flags when a stock becomes buy-worthy under the book's rules.

**It never invests, places no orders, and connects to no broker.** It is a
watchlist and an analysis tool. The last step — deciding whether a problem is
temporary or structural — is deliberately left to a person.

The interface is fully bilingual (English and Dutch). Dutch is the source
language for the book-derived copy; see [i18n](#internationalisation).

---

## What it actually does

1. **Every night**, it fetches fundamentals for everything on the watchlist,
   computes ~20 ratios, classifies each company, evaluates a nine-point
   checklist, and writes the result with a plain-language explanation of *why*.
2. **When a stock crosses into buy-worthy**, it emails you — with the full
   reasoning in the body, not just a ticker.
3. **It scans the wider universe** for companies that already clear the bar and
   files them as suggestions for you to accept or dismiss.
4. **It shows market-wide context** — how expensive the market is, whether the
   yield curve is inverted, how narrow the index has become.
5. **It asks you the question it cannot answer**: is this dip temporary or
   structural?

### The focus sectors (chapter 2)

Only four sectors count, both for the auto-scan and as a warning when adding a
ticker by hand:

| Sector | What it covers |
|---|---|
| Information technology | Semiconductors, chip equipment, hardware, software |
| Luxury / consumer discretionary | Luxury brands, premium consumer goods, travel, hospitality |
| Entertainment & interactive media | Streaming, social, search, gaming, digital advertising |
| Financial services, non-bank | Payment networks and processors. **Banks and insurers are excluded.** |

Mapping runs from FinanceDatabase's sector/industry labels onto these four,
editable in the database. Three of its labels need overriding, which is worth
knowing before you edit the table:

- **Alphabet and Meta** are filed under *Diversified Telecommunication
  Services*, not Interactive Media. That whole industry is mapped into the
  entertainment focus; the telcos it also contains get screened out on growth
  and margins.
- **Adyen** is filed under Information Technology / Software. It is overridden
  to payments, as the book treats it.
- **EssilorLuxottica** is filed under Health Care. It is overridden to luxury.

Region filter: **US first, Europe second.** Everything else is excluded.

---

## The scoring rules

### Lynch classification (chapter 7)

Every company is placed in one category, from its five-year earnings growth:

| Category | Rule | Can earn a buy signal? |
|---|---|---|
| High growth | EPS growth ≥ 20%/yr | Yes |
| Average growth | 10–20%/yr | Yes |
| Low growth | < 10%/yr | Only with an explicit warning |
| Cyclical | Cyclical industry **and** volatile earnings | No |
| Turnaround | Losses or multi-year decline | No |
| Financial institution | Bank or insurer | No |

**Semiconductors are not cyclicals.** Their earnings are volatile, but the book
names microchips as the best-performing subsector it covers, and its own
cyclical list is auto, construction, commodities and industrials. Classifying
NVDA, AMD and AVGO as cyclical would have barred the book's headline examples
from ever receiving a signal.

**Tolerance band (±1pp, resolving upward).** Lynch's percentages came from a
qualitative method. Digitised, they become cliffs: a company at 19.9% would have
its PEG ceiling cut from 1.0 to 0.7 — a 30% tightening — for missing a band by
ten basis points. Growth between 19.0% and 19.9% resolves up to high growth, and
9.0%–9.9% to average growth. A result lifted this way is marked, so the
borderline stays visible.

### Growth is measured by least squares, not endpoints

A compound annual growth rate reads only its first and last observation, so one
distorted year sets the whole rate. Instead, growth is fitted as:

```
ln(y) = β·x + α        growth = e^β − 1
```

…which is still a compound rate in the same units, but one every observation
contributes to. `x` is elapsed years, not an index, so irregular fiscal periods
are handled rather than assumed even. Fewer than three positive points falls
back to the endpoint CAGR, and the method used is recorded on the result.

Worked example — year 1 inflated, years 2–5 a clean recovery:

```
[150, 100, 110, 125, 140]     endpoint CAGR: −1.71%     LSGR: +0.86%
```

This cuts both ways, and should. AMD and AVGO drop *further* under LSGR, because
their earnings are a deep V — a high start, a trough below both ends, a partial
recovery. That is what the series says.

### The nine buy-worthy conditions (chapter 9)

All applicable conditions must pass for **Buy-worthy**:

| # | Condition | Target |
|---|---|---|
| 1 | Focus sector | One of the four |
| 2 | Growth category | High or average |
| 3 | Market capitalisation | ≥ $10B (converted to USD) |
| 4 | Decline from 5-year high | ≥ 50% (adjustable, floor 35%) |
| 5 | PEG | ≤ 1 / 0.7 / 0.5 by category — **trailing or forward** |
| 6 | P/E | ≤ 30, or R&D-adjusted ≤ 20 for tech |
| 7 | ROE and ROA | ROE > 15% and ROA > 10%, sustained |
| 8 | Cash flow | FCF positive, OCF ≥ 70% of net income |
| 9 | Debt | Net debt/EBITDA ≤ 2.5 |

**The denominator is never assumed to be nine.** Each condition declares whether
it applies. Banks and insurers have no meaningful free cash flow or debt ratio,
so they are scored out of seven — scoring them out of nine would mark them down
for checks that cannot apply.

**Condition 5 passes on either PEG.** Trailing-only would systematically reject
the pattern the book is built around: a quality company in a temporary growth
dip, which is exactly when chapter 9 says to act. Forward-only would lean
entirely on analyst consensus, which chapter 1 is sceptical of. Either may carry
it, and `signal_history.peg_basis` records which did. When only the forward PEG
passed, the explanation says so and points at the qualitative review by name.

**Status rules**

- All applicable conditions pass → **Buy-worthy** → email sent
- Conditions 1–3 pass and at most one of the rest fails → **Almost there**
- Otherwise → **Watching**, with the missing conditions listed

---

## Ratio definitions

All twenty are documented in both languages in
[`docs/ratios.en.md`](docs/ratios.en.md) and
[`docs/ratios.nl.md`](docs/ratios.nl.md), which are the single source for the
tooltip text. Each target is marked **from the book** or **app default**; app
defaults are adjustable.

Four behaviours worth knowing, all of which exist because real data broke the
naive version:

**Currency conversion.** Price and market cap are quoted in the trading
currency; the statements are in the filing currency. ASML trades in USD on
NasdaqGS and reports in EUR. Every price-based ratio converts first, and when no
rate is available the ratio is withheld rather than computed wrong. Unconverted,
ASML's P/E read 61.6 against Yahoo's 57.5.

**Definitional breaks.** A multi-year series can contain a step where the
company changed *what* it reports. Adyen restated revenue from gross to net in
2023 (€8.94bn → €1.86bn); a growth rate across that step read −33%/yr against
real growth near +20%. Growth ratios detect the break and use only the periods
on the current basis.

**Payment processors.** Their balance sheets carry customer settlement
balances — funds in transit between merchants, card networks and banks — which
inflate assets and receivables without saying anything about operating
performance. For companies flagged `is_payment_processor`, ROA is adjusted and
the inventory/receivables check is n/a. The raw ROA stays visible beside the
adjusted one. The deduction is floored at shareholders' equity, because
settlement float is liability-funded by definition; without that floor the proxy
stripped almost the whole balance sheet and put Adyen's ROA at 261%.

**Basis matching.** Return ratios divide a flow by the base that produced it, so
both must span the same window. Pairing a TTM numerator with the average of the
last two *annual* balance sheets left the numerator months ahead of the
denominator — harmless normally, badly wrong for a company growing as fast as
NVDA, whose ROA came out at 121%.

### Standing invariants

`lib/ratios/invariants.ts` runs for every company on every pipeline run and in
the test suite. These are arithmetic truths, not heuristics — if one breaks, a
number is wrong and any signal built on it is wrong too:

- Assets ≥ equity, therefore **ROA ≤ ROE**, always
- No price-based ratio combines two currencies unconverted
- Forward growth is never derived from an unconverted consensus EPS

A violation is logged loudly and recorded, never left to be spotted by eye.

---

## Architecture

| Layer | Choice | Notes |
|---|---|---|
| Frontend + server | Next.js (App Router, TypeScript) | Every route is server-rendered; no static export |
| Database, auth, cron | Supabase (Postgres) | RLS on every table; `pg_cron` + `pg_net` for the nightly job |
| Styling | Tailwind CSS v4 | |
| i18n | next-intl, no routing | One household, so the locale is a preference, not a URL segment |
| Email | Resend | |
| AI summaries | `@google/genai` (pinned) | Optional; without a key the AI block is hidden |
| Hosting | Netlify | |
| Tests | Vitest | 141 tests |

### Market data: four sources behind one interface

Nothing outside `lib/providers/` knows where a number came from. Providers
normalise onto canonical metric names, so a source can be swapped without
touching the ratio engine.

| Source | Supplies | Why |
|---|---|---|
| **SEC EDGAR** | Annual statements, filing currency | 16–19 years of history, no API key, the filings themselves |
| **yahoo-finance2** | Statements for non-SEC filers, estimates, filing currency, macro | Covers EU listings EDGAR cannot |
| **finance-query** | Quotes, prices, news, search, quarterly statements | The only source of price history |
| **Financial Modeling Prep** | Analyst estimates | Optional; free tier refuses most symbols |

Statements are merged **metric by metric**, not all-or-nothing. Visa is why:
EDGAR returns 19 years of revenue and net income for it but no EPS at all,
because it is a multi-class filer whose EPS only exists under dimensional axes
the companyfacts API does not expose. Merging also aligns fiscal periods within
a fortnight — Apple's FY2025 ends 2025-09-27 in its filing and 2025-09-30 in
Yahoo's calendar, and keying on the exact date gave AAPL 23 periods instead
of 19.

**EDGAR is annual-only here, deliberately.** Its quarterly XBRL facts have a
Q4-shaped hole every year, because 10-Qs cover Q1–Q3 and the fourth quarter only
appears inside the 10-K. Summing "the last four quarterly facts" skipped Q4 and
double-counted an older quarter.

### Sharing model

Two users, one household. Each table gets the rule that fits it:

| Table | Scope |
|---|---|
| `watchlist_items` | **Shared.** Either member sees and edits everything; `user_id` records who added it |
| `suggestions` | **Shared.** The scan writes them; either member decides |
| `qualitative_reviews` | **One per person**, readable by both. A judgement is personal — but disagreeing is the useful part |
| `settings` | **Private.** Language, thresholds, alert address |
| `ticker_summaries` | **Shared.** The thesis describes the company, not the reader |

### Authentication

Two ways in — a password, or a magic link — both from the same form on
`/login`, and both gated by the same email whitelist. An account created through
a magic link has no password, so `/account` is where a member sets one.

The form reveals nothing: an address that is not on the whitelist fails
*identically* to a wrong password, and a magic-link request answers the same way
whether or not the address is approved. Otherwise the form would be a way to
work out who has access.

The whitelist is enforced **twice**:

- Before a link is sent, so a stranger cannot make the app email them at all
- In `is_allowed_user()`, called by every RLS policy, so a valid session for a
  de-whitelisted address reads nothing

The database is the real boundary; the app-layer check exists so the failure is
a clear message rather than an empty screen. The sign-in form returns the same
response either way, so it cannot be used to discover who has access.

---

## Setup

### Prerequisites

Node 22+, a Supabase project, and the Supabase CLI (`brew install supabase/tap/supabase`).

### 1. Install and configure

```bash
npm install
cp .env.example .env.local   # then fill it in — see the table below
```

### 2. Apply the database schema

```bash
npm run db:validate                              # applies migrations to an in-memory Postgres first
supabase link --project-ref <your-project-ref>
supabase db push
```

`db:validate` runs every migration against PGlite with the Supabase-specific
pieces stubbed, so schema errors surface without Docker or a live project.

### 3. Seed reference data

```bash
npx tsx --env-file=.env.local scripts/sync-allowlist.ts      # ALLOWED_EMAILS → allowed_users
npx tsx --env-file=.env.local scripts/import-universe.ts     # ~102k equities from FinanceDatabase
npx tsx --env-file=.env.local scripts/seed-translations.ts   # docs/ratios.*.md → translations
npx tsx --env-file=.env.local scripts/seed-watchlist.ts      # the seed list from the brief
npx tsx --env-file=.env.local scripts/verify-universe.ts     # check the sector mapping resolved
```

The universe import takes a couple of minutes and caches the dataset under
`.cache/`. Re-run it to refresh; it upserts.

### 4. Enable magic links in Supabase

In the dashboard: **Authentication → Providers → Email**, enable email
sign-in. Under **URL Configuration**, add both redirect URLs:

```
http://localhost:3000/auth/callback
https://<your-site>.netlify.app/auth/callback
```

### 5. Run

```bash
npm run dev
```

### 6. Populate the first signals

```bash
npx tsx --env-file=.env.local scripts/run-pipeline.ts        # ratios, signals, macro, emails
npx tsx --env-file=.env.local scripts/run-scan.ts --limit 60 # a batch of the universe scan
```

---

## Environment variables

### Required

| Variable | What it does |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (reaches the browser) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (reaches the browser) |
| `SUPABASE_URL` | Same URL, server-side |
| `SUPABASE_ANON_KEY` | Same anon key, server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses RLS.** Nightly job and scripts only — never expose |
| `ALLOWED_EMAILS` | Comma-separated sign-in whitelist. Run `sync-allowlist.ts` after changing |
| `NEXT_PUBLIC_SITE_URL` | Absolute site URL, for the magic-link redirect |
| `CRON_SECRET` | Shared secret for `/api/cron/nightly-scan` and `/api/cron/digest`. Generate with `openssl rand -hex 32` |

### Email alerts

| Variable | What it does |
|---|---|
| `RESEND_API_KEY` | Without it the mailer logs instead of sending, and the log row records `skipped` |
| `RESEND_FROM` | Verified sender. Resend's default `onboarding@resend.dev` only delivers to your own account address |
| `NOTIFY_EMAILS` | Fallback recipients, used until members save their own notification settings |

### Optional

| Variable | What it does |
|---|---|
| `GEMINI_API_KEY` | Enables AI thesis summaries. Without it the AI block is hidden and nothing is stored |
| `GEMINI_MODEL` | Defaults to `gemini-3.6-flash` |
| `FMP_API_KEY` | Analyst estimates. Free tier covers ~15 of the 27 seed tickers; yahoo-finance2 catches the rest |
| `SEC_USER_AGENT` | Contact string EDGAR's access policy requires, e.g. `"app-name/0.1 (you@example.com)"` |
| `SCAN_BATCH_SIZE` | Candidates evaluated per nightly run (default 60) |
| `FINANCE_QUERY_BASE_URL` | Point at a self-hosted finance-query |
| `FRED_API_KEY` | Not needed — FRED's CSV endpoint is keyless |

---

## Deploying to Netlify

1. Connect the repository. `netlify.toml` sets the build command, the Next.js
   plugin, security headers and redirects.
2. Add every required environment variable under **Site settings →
   Environment variables**.

   > **The `NEXT_PUBLIC_*` values must exist before the build runs.** Next.js
   > inlines them into the bundle — including the edge middleware, which runs on
   > every request — so a deploy whose build happened before they were set
   > carries `undefined` regardless of what the runtime environment holds. The
   > symptom is `Your project's URL and Key are required to create a Supabase
   > client!` on every page. The fix is a **rebuild**, not a restart: set the
   > variables, then **Deploys → Trigger deploy → Clear cache and deploy site**.
   > In Netlify, leave their scope as *All* (or at least include *Builds*);
   > scoping them to Functions only reproduces the same failure.
3. Set `NEXT_PUBLIC_SITE_URL` to the deployed URL and add
   `https://<site>/auth/callback` to Supabase's redirect allowlist.
4. Deploy.

### Schedule the nightly job

Once deployed, create the schedule from the Supabase SQL editor:

```sql
select schedule_nightly_scan(
  'https://your-site.netlify.app',
  '<the same CRON_SECRET you set in Netlify>'
);
```

This runs `/api/cron/nightly-scan` at **02:00 UTC** — comfortably after the US
close, which is the reason for running at night at all. Re-running the function
replaces the schedule rather than stacking a second one.

Check it:

```sql
select jobname, schedule, active from cron.job where jobname = 'nightly-scan';
select * from cron.job_run_details order by start_time desc limit 5;
```

### The digest, on its own schedule

The daily digest runs at the end of the nightly pipeline, which is where it
belongs — it reports on what that run computed. `/api/cron/digest` exists for
the cases that are not that: sending it at a different hour from the scan,
re-running after a failed send, or triggering one by hand. It reads what the
last run stored rather than recomputing anything, so it is cheap and safe to
call repeatedly — the per-recipient, per-day row in `notifications_log` is what
stops a second call sending a second email.

```bash
curl -X POST https://<site>/api/cron/digest \
  -H "Authorization: Bearer $CRON_SECRET"
# {"ok":true,"asOf":"…","evaluated":27,"recipients":2,"sent":2,"simulated":0,"skipped":0,"failed":0}
```

`GET /api/cron/digest` reports readiness without sending anything. Note that
`sent` counts mail that actually left; without `RESEND_API_KEY` the run is
reported under `simulated`, never as sent.

The endpoint is protected by `CRON_SECRET`, compared in constant time. A request
without it is refused before any work starts, and if the secret is unset the
endpoint is **closed**, not open. `GET` is a health check that reports readiness
without running anything.

### What the nightly job does, and its limits

1. Refreshes market context (never fatally — a FRED outage must not cost a night
   of signals)
2. Recomputes every watchlist ticker and stores ratios, signals and explanations
3. Emails any stock that crossed into buy-worthy
4. Advances the universe scan by one batch

**Rate-limit safeguards** are deliberate, not incidental:

- The scan processes `SCAN_BATCH_SIZE` candidates and stores a cursor, so
  consecutive nights walk through ~6,800 large-cap candidates instead of
  re-scanning the first page. A full sweep takes a couple of weeks.
- The scan skips analyst estimates entirely — FMP allows roughly 250 requests a
  day, far fewer than the scan covers.
- EDGAR requests are throttled to the SEC's 10/second policy and sent with the
  required User-Agent.
- Statement fetches are batched; a 27-ticker refresh costs six statement calls,
  not 162.
- `notifications_log` has a unique index on `(recipient, kind, symbol, as_of)`,
  so a re-run cannot send the same alert twice.

---

## Internationalisation

Both languages are a hard requirement, not a nice-to-have. The test suite fails
the build if they drift.

- **UI chrome** lives in `messages/en.json` and `messages/nl.json`. A test
  asserts identical key sets and no empty strings.
- **Ratio, condition, catalyst and sell-signal copy** lives in
  `docs/ratios.nl.md` and `docs/ratios.en.md`. Dutch is written first, close to
  the book's own phrasing; English is a faithful rendering rather than a literal
  one. `seed-translations.ts` loads them into the `translations` table and
  **refuses to write** if the languages are out of step or an explanation is
  empty.
- **A test asserts every ratio the engine computes has a documented
  explanation**, so adding a ratio without documenting it in both languages
  fails the build.
- **Generated content** — the signal explanation and the AI thesis — is produced
  in both languages together and stored side by side. The AI thesis gets both
  from a single call.
- Numbers follow the locale: `1,234.56` against `1.234,56`, from identical
  stored values.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Vitest, 141 tests |
| `npm run db:validate` | Applies every migration to an in-memory Postgres |
| `scripts/run-pipeline.ts` | The nightly job, by hand. `--no-email` for a dry run, `--detail SYM` for one ticker |
| `scripts/run-scan.ts` | One universe-scan batch. `--limit N --cursor N` |
| `scripts/import-universe.ts` | FinanceDatabase → `universe`. `--reset-map` to re-seed the sector mapping |
| `scripts/seed-translations.ts` | Markdown → `translations`. `--check` validates without writing |
| `scripts/seed-watchlist.ts` | The seed list onto the shared watchlist |
| `scripts/sync-allowlist.ts` | `ALLOWED_EMAILS` → `allowed_users` |
| `scripts/verify-universe.ts` | Checks the sector mapping against the seed list |
| `scripts/checkpoint-provider.ts` | Prints every computed ratio for three tickers, for hand-checking |

---

## Troubleshooting

**`Your project's URL and Key are required to create a Supabase client!`**
`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` was missing when
the bundle was built. Set both in the build environment and redeploy with the
cache cleared — see the note under [Deploying](#deploying-to-netlify). Locally,
this means `.env.local` is missing or lacks those two keys; `.env.local` is
gitignored, so a fresh clone has to start from `cp .env.example .env.local`.
Both clients now name the missing variable instead of raising that generic
message.

**No sign-in link arrives.** First check the address is on the allowlist — an
unapproved address is answered with the same "link sent" message but nothing is
sent, which is deliberate. If it is approved, the usual cause is Supabase's
built-in SMTP: it is rate-limited to a handful of emails an hour and is often
dropped by corporate filters. Point Supabase at Resend under Authentication →
Emails → SMTP Settings, or sign in with a password instead.

**Signing in does nothing / the magic link 404s.** Email sign-in is not enabled,
or the callback URL is not on Supabase's allowlist. Both live under
Authentication → Providers → Email and Authentication → URL Configuration.

**Nobody has a password yet.** Sign in with a magic link once, then set one at
`/account`. To issue a link without email delivery at all, generate one with the
service role: `supabase.auth.admin.generateLink({ type: 'magiclink', email })`.

**Alerts are not arriving.** Without `RESEND_API_KEY` the mailer logs instead of
sending and records `skipped` in `notifications_log` with the reason. With a key
but no verified domain, Resend's default sender only delivers to your own
account address.

**The nightly job never runs.** Check `select * from cron.job_run_details order
by start_time desc limit 5;`. A 401 means `CRON_SECRET` differs between Netlify
and the argument passed to `schedule_nightly_scan`.

---

## Known limits

- **Six EU listings have shallower data.** ADYEN.AS, RMS.PA, MC.PA, KER.PA,
  CFR.SW and EL.PA are not SEC filers, so they run on yahoo-finance2's five
  annual years. Adyen reports semi-annually, so it has no quarterly data
  anywhere and runs on an annual trailing basis.
- **FMP's free tier is narrow.** It covers roughly 15 of the 27 seed tickers and
  refuses every EU listing; yahoo-finance2 fills the gap.
- **The universe scan is slow by design.** Each candidate needs a fundamentals
  round-trip, so the feed fills in over a couple of weeks rather than overnight.
- **Market cap uses the FinanceDatabase band**, not a live figure, to pre-filter
  scan candidates. The $10B condition itself is checked against the real
  converted market cap.
- **The Buffett indicator uses Yahoo's `^W5000`.** FRED's Wilshire series were
  discontinued; the Fed Z.1 corporate-equities level is the documented fallback,
  and using it is recorded on the row.

---

## Disclaimer

This is a personal analysis tool, not investment advice.
*Dit is een persoonlijke analysetool, geen beleggingsadvies.*
