-- 0036_insider_activity.sql
--
-- Insider buying and selling, from the companies' own Form 4 filings.
--
-- Cached per symbol rather than fetched on demand every time, because the
-- cost is not one request: EDGAR gives a filing index per company and then
-- one XML per filing, and a company like Apple files a Form 4 most weeks. A
-- ninety-day window is ten to forty documents, and EDGAR asks callers to stay
-- under ten requests a second. That is a few seconds per company — fine once
-- a day, unacceptable on every page view, and impossible inside the nightly
-- run, which has about seventeen seconds of headroom in total.
--
-- So: refreshed lazily when a stock page asks and the row is stale, never by
-- the nightly job. The feed is a supporting detail on one page, not something
-- the digest or the verdict depends on, and it is allowed to be a day old.
--
-- `summary` holds the rolled-up counts the catalyst checkbox needs;
-- `transactions` holds the individual rows behind them so the page can show
-- its working. Both are jsonb because their shape belongs to the parser, and
-- pinning it into columns would mean a migration every time Form 4 grows a
-- field worth keeping.

create table insider_activity (
  symbol        text primary key,

  -- When this was last fetched, and how far back it looked.
  fetched_at    timestamptz not null default now(),
  window_days   integer not null,

  -- { buys, sells, sharesBought, sharesSold, netValue, buyers[], sellers[] }
  summary       jsonb not null default '{}'::jsonb,
  -- One entry per reported transaction, newest first.
  transactions  jsonb not null default '[]'::jsonb,

  -- How many Form 4s were read to produce this, so a thin result can be told
  -- apart from a company that genuinely had no insider activity.
  filings_read  integer not null default 0,

  -- Set when the fetch failed. The page shows nothing rather than an error,
  -- but the reason is kept so a provider that has quietly started refusing us
  -- does not look like a run of companies with no insider trades.
  error         text
);

create index insider_activity_fetched_idx on insider_activity (fetched_at);

comment on table insider_activity is
  'Form 4 insider transactions per symbol, refreshed lazily from EDGAR. Never written by the nightly job.';

alter table insider_activity enable row level security;

-- Read-only to the household; written by the service role from the API route.
create policy insider_activity_read on insider_activity
  for select to authenticated using (public.is_allowed_user());
