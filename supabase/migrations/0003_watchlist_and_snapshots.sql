-- 0003_watchlist_and_snapshots.sql
-- The watchlist itself, plus the raw provider data cached per ticker per day.
-- Everything the provider returns is cached so the app keeps working on the
-- latest snapshot when the data source is temporarily unavailable (section 1).

-- ---------------------------------------------------------------------------
-- watchlist_items
-- ---------------------------------------------------------------------------
create table watchlist_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  symbol        text not null,
  -- Denormalised at insert time so the watchlist renders without a join.
  name          text,
  focus_sector  focus_sector not null default 'outside_focus',
  -- True when added manually despite sitting outside the four focus sectors;
  -- the UI shows the orange "outside the book's focus sectors" label.
  outside_focus boolean not null default false,
  -- 'manual' | 'seed' | 'suggestion'
  added_via     text not null default 'manual',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, symbol)
);

create index watchlist_items_user_idx on watchlist_items (user_id);

create trigger watchlist_items_set_updated_at
  before update on watchlist_items
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- daily_snapshots: all raw figures per ticker per day.
--
-- One row per (symbol, as_of). The payload columns keep the provider's own
-- shape so the ratio engine can be re-run over history after a bug fix without
-- re-fetching, and so a provider swap stays auditable.
-- ---------------------------------------------------------------------------
create table daily_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  symbol             text not null,
  as_of              date not null,

  -- Normalised headline figures, lifted out of the payload for cheap querying.
  price              numeric,
  currency           text,
  market_cap_usd     numeric,
  shares_outstanding numeric,

  -- Raw provider payloads.
  quote              jsonb,
  income_annual      jsonb,
  income_quarterly   jsonb,
  balance_annual     jsonb,
  balance_quarterly  jsonb,
  cash_annual        jsonb,
  cash_quarterly     jsonb,
  estimates          jsonb,
  -- 5 years of daily closes, used for the drawdown signal (5.18).
  price_history      jsonb,

  -- Provenance: which provider produced this row, and whether any part of the
  -- fetch fell back to an older cached value.
  provider           text not null default 'finance-query',
  is_stale           boolean not null default false,
  fetch_errors       jsonb not null default '[]'::jsonb,

  created_at         timestamptz not null default now(),
  unique (symbol, as_of)
);

create index daily_snapshots_symbol_asof_idx on daily_snapshots (symbol, as_of desc);
