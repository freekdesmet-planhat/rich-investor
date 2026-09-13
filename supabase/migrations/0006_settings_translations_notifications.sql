-- 0006_settings_translations_notifications.sql
-- Adjustable thresholds, UI preferences, the translation layer and the
-- notification log.

-- ---------------------------------------------------------------------------
-- settings: one row per user. All adjustable thresholds live in `thresholds`
-- as a single JSON document, seeded from lib/thresholds defaults so a new key
-- never needs a migration.
-- ---------------------------------------------------------------------------
create table settings (
  user_id            uuid primary key references auth.users (id) on delete cascade,

  -- 'en' | 'nl'; null means "follow the browser" until the user picks one.
  language           text check (language in ('en', 'nl')),

  thresholds         jsonb not null default '{}'::jsonb,

  -- Auto-scan configuration (section 4).
  scan_regions       text[] not null default array['US', 'Europe'],
  scan_enabled       boolean not null default true,

  -- Notifications (section 3.6).
  notify_email       text,
  notify_on_buy      boolean not null default true,
  weekly_summary     boolean not null default true,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger settings_set_updated_at
  before update on settings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- translations: seeded from docs/ratios.en.md and docs/ratios.nl.md so tooltips
-- and documentation share a single source per language (section 2).
--
-- `namespace` is e.g. 'ratio', 'checklist', 'qualitative'; `key` is the ratio
-- key or checklist key; `field` is 'title' | 'explanation' | 'target'.
-- ---------------------------------------------------------------------------
create table translations (
  id         uuid primary key default gen_random_uuid(),
  namespace  text not null,
  key        text not null,
  field      text not null default 'explanation',
  lang       text not null check (lang in ('en', 'nl')),
  value      text not null,
  -- Where the row came from, so a re-import can safely replace it.
  source     text not null default 'docs',
  updated_at timestamptz not null default now(),
  unique (namespace, key, field, lang)
);

create index translations_lookup_idx on translations (namespace, lang);

create trigger translations_set_updated_at
  before update on translations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- notifications_log: every email the app sends, with the exact body, so a
-- delivery can be audited and never sent twice for the same event.
-- ---------------------------------------------------------------------------
create table notifications_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  kind        notification_kind not null,
  symbol      text,
  as_of       date not null,

  recipient   text not null,
  subject     text not null,
  body        text not null,
  lang        text not null default 'en' check (lang in ('en', 'nl')),

  state       notification_state not null default 'sent',
  error       text,
  provider_id text,

  created_at  timestamptz not null default now()
);

-- One buy-signal mail per ticker per day; weekly summaries have no symbol.
create unique index notifications_log_dedupe_idx
  on notifications_log (user_id, kind, coalesce(symbol, ''), as_of);

-- ---------------------------------------------------------------------------
-- market_context: the market-wide dashboard block (section 5.20). Not per
-- stock, so it gets its own single-row-per-day table.
-- ---------------------------------------------------------------------------
create table market_context (
  as_of                 date primary key,
  -- Total US market cap / GDP, in percent.
  buffett_indicator     numeric,
  buffett_source        text,
  fed_funds_rate        numeric,
  ecb_deposit_rate      numeric,
  -- 'falling' | 'rising' | 'flat', over the last 12 months.
  rate_direction        text,
  -- Percentage of S&P 500 constituents beating the index this year.
  pct_beating_index     numeric,
  detail                jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);
