-- 0002_universe_and_sector_mapping.sql
-- The ticker universe imported from FinanceDatabase, and the editable mapping
-- from its sector/industry values onto the book's four focus sectors.

-- ---------------------------------------------------------------------------
-- universe: one row per equity in the FinanceDatabase equities dataset.
-- Refreshed by scripts/import-universe.ts, which upserts on `symbol`.
-- ---------------------------------------------------------------------------
create table universe (
  symbol          text primary key,
  name            text,
  sector          text,
  industry_group  text,
  industry        text,
  exchange        text,
  country         text,
  -- 'US' / 'Europe' / other; the auto-scan filters on this (book, chapter 2).
  region          text,
  currency        text,
  market          text,
  market_cap_band text,
  -- Set by the daily job so the scan can filter on size without a live fetch.
  market_cap_usd  numeric,
  imported_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index universe_sector_idx   on universe (sector);
create index universe_industry_idx on universe (industry);
create index universe_region_idx   on universe (region);

create trigger universe_set_updated_at
  before update on universe
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- sector_mapping: FinanceDatabase sector/industry -> one of the four focus
-- sectors. Editable from the settings screen (section 4).
--
-- `industry` null means the rule matches on sector alone; a row with a concrete
-- industry wins over a sector-only row (see `specificity`).
-- ---------------------------------------------------------------------------
create table sector_mapping (
  id           uuid primary key default gen_random_uuid(),
  sector       text not null,
  industry     text,
  focus_sector focus_sector not null,
  -- Higher wins when several rules match. Industry rules are seeded at 10,
  -- sector-only rules at 0.
  specificity  int not null default 0,
  -- Banks and insurers are explicitly excluded from the focus (section 4); such
  -- rows are mapped to 'outside_focus' and flagged here so the UI can explain why.
  is_excluded  boolean not null default false,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One rule per (sector, industry) pair; `industry is null` is its own rule.
create unique index sector_mapping_unique_idx
  on sector_mapping (sector, coalesce(industry, ''));

create trigger sector_mapping_set_updated_at
  before update on sector_mapping
  for each row execute function set_updated_at();
