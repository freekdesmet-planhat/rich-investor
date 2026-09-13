-- 0004_ratios_and_signals.sql
-- Computed ratios per ticker per day, and the daily buy-worthy signal including
-- the generated "why" text in both languages (sections 5 and 7).

-- ---------------------------------------------------------------------------
-- ratios: one row per (symbol, as_of, ratio_key).
--
-- `ratio_key` matches the keys in lib/ratios (e.g. 'pe', 'peg', 'ev_ebit',
-- 'drawdown_5y'), which are also the lookup keys into docs/ratios.<lang>.md.
-- ---------------------------------------------------------------------------
create table ratios (
  id               uuid primary key default gen_random_uuid(),
  symbol           text not null,
  as_of            date not null,
  ratio_key        text not null,

  value            numeric,
  -- Pre-formatted display unit: 'ratio' | 'percent' | 'currency' | 'x'.
  unit             text,
  color            ratio_color not null default 'gray',

  -- The target this value was judged against, kept alongside the result so a
  -- historical row still explains itself after the user edits a threshold.
  target_label     text,
  target_source    threshold_source not null default 'app_default',
  thresholds       jsonb,

  -- Last 5 fiscal years for the sparkline / mini-table, as
  -- [{ "period": "2025-09-30", "value": 12.3 }, ...].
  history          jsonb not null default '[]'::jsonb,

  -- Set when the ratio does not apply (banks/insurers, no inventory, ...).
  not_applicable   boolean not null default false,
  -- Why there is no value: 'missing_data' | 'not_applicable' | 'negative_base'.
  unavailable_reason text,
  -- Extra computed figures the tooltip shows (e.g. buyback split for EPS growth).
  detail           jsonb not null default '{}'::jsonb,

  created_at       timestamptz not null default now(),
  unique (symbol, as_of, ratio_key)
);

create index ratios_symbol_asof_idx on ratios (symbol, as_of desc);
create index ratios_key_idx         on ratios (ratio_key);

-- ---------------------------------------------------------------------------
-- signal_history: the daily status per ticker.
--
-- The generated explanation is stored in both languages so a historical signal
-- keeps its original reasoning even after thresholds or figures change
-- (section 7).
-- ---------------------------------------------------------------------------
create table signal_history (
  id              uuid primary key default gen_random_uuid(),
  symbol          text not null,
  as_of           date not null,

  status          signal_status not null,
  lynch_category  lynch_category not null default 'unknown',
  focus_sector    focus_sector not null default 'outside_focus',

  -- How many of the 9 hard conditions passed.
  conditions_met  int not null default 0,
  conditions_total int not null default 9,
  -- Full checklist: [{ "key": "peg", "passed": true, "value": 0.8,
  --                    "target": "<= 1", "detail": {...} }, ...]
  checklist       jsonb not null default '[]'::jsonb,

  -- The mandatory plain-language "why", required in both languages.
  why_en          text not null,
  why_nl          text not null,

  -- Snapshot of the ratio values the explanation was generated from, so the
  -- text can always be traced back to the numbers that produced it.
  ratio_snapshot  jsonb not null default '{}'::jsonb,
  -- Thresholds in force on the day, for the same reason.
  thresholds_used jsonb not null default '{}'::jsonb,

  -- Set on the day the status crosses into 'buy_worthy' from something else;
  -- this is what triggers the notification.
  became_buy_worthy boolean not null default false,
  previous_status   signal_status,

  created_at      timestamptz not null default now(),
  unique (symbol, as_of)
);

create index signal_history_symbol_asof_idx on signal_history (symbol, as_of desc);
create index signal_history_status_idx      on signal_history (status, as_of desc);

-- ---------------------------------------------------------------------------
-- suggestions: results of the daily auto-scan over the universe (section 3.1).
-- Dismissed tickers are not re-suggested for 90 days.
-- ---------------------------------------------------------------------------
create table suggestions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  symbol         text not null,
  name           text,
  focus_sector   focus_sector not null,
  state          suggestion_state not null default 'pending',
  status         signal_status not null default 'watching',
  -- Why it surfaced, in both languages, reusing the same generator.
  why_en         text,
  why_nl         text,
  ratio_snapshot jsonb not null default '{}'::jsonb,
  suggested_at   date not null,
  decided_at     timestamptz,
  -- Set to suggested_at + 90 days when rejected.
  rejected_until date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, symbol)
);

create index suggestions_user_state_idx on suggestions (user_id, state);

create trigger suggestions_set_updated_at
  before update on suggestions
  for each row execute function set_updated_at();
