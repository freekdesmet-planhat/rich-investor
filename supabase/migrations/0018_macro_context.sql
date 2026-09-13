-- 0018_macro_context.sql
--
-- The market-wide dashboard block (section 5.20): one row per day holding the
-- macro weather, separate from the per-stock tables because none of it is about
-- a company.
--
-- Replaces `market_context` from 0006, which was created as a placeholder,
-- never written to and never read. Keeping two tables for one purpose would
-- leave the next reader guessing which is live.

drop table if exists market_context;

create table macro_context (
  date               date primary key,

  -- Total US market capitalisation over GDP, in percent. The book's
  -- "temperature gauge": Buffett called 70-80% cheap, and it stood above 200%
  -- by mid-2025. Not a timing tool — an indication of how much effort finding a
  -- buy-worthy stock is going to take.
  buffett_indicator  numeric,

  -- 10-year minus 2-year Treasury yield, in percentage points. Negative is an
  -- inverted curve.
  yield_spread_10y2y numeric,

  -- Cap-weighted minus equal-weighted S&P 500 one-year return, in percentage
  -- points. A wide positive gap means the index is being carried by its largest
  -- members — the book's concentration point, measured with instruments that
  -- actually have daily prices.
  spy_rsp_spread     numeric,

  -- Trailing P/E for the S&P 500, as a baseline to read a single company's
  -- multiple against.
  sp500_pe           numeric,

  -- Where each figure came from and anything that could not be fetched, so a
  -- gap on the dashboard is explainable rather than mysterious.
  sources            jsonb not null default '{}'::jsonb,
  errors             jsonb not null default '[]'::jsonb,

  created_at         timestamptz not null default now()
);

comment on table macro_context is
  'Daily market-wide context (section 5.20). One row per day, written by the nightly job.';

alter table macro_context enable row level security;

-- Readable by the household; only the service role writes it, so no insert or
-- update policy is granted to `authenticated`.
create policy macro_context_read on macro_context
  for select to authenticated
  using (public.is_allowed_user());
