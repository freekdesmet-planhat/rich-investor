-- 0001_extensions_and_enums.sql
-- Shared enums and helper functions used by the rest of the schema.
--
-- gen_random_uuid() is in core Postgres since 13, so no pgcrypto needed.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- The four focus sectors from the book (chapter 2), plus a catch-all for
-- everything the mapping does not place inside the focus.
create type focus_sector as enum (
  'information_technology',
  'luxury_consumer',
  'entertainment_media',
  'financial_services_non_bank',
  'outside_focus'
);

-- Peter Lynch categories (chapter 7).
create type lynch_category as enum (
  'high_growth',
  'average_growth',
  'low_growth',
  'cyclical',
  'turnaround',
  'financial_institution',
  'unknown'
);

-- Colour code shown on every ratio card.
create type ratio_color as enum ('green', 'orange', 'red', 'gray');

-- Buy-worthy signal status (section 7).
create type signal_status as enum ('buy_worthy', 'almost', 'watching');

-- Where a threshold comes from: literally stated in the book, or an app default
-- that the user may change in the settings screen.
create type threshold_source as enum ('book', 'app_default');

-- Lifecycle of an auto-scan suggestion.
create type suggestion_state as enum ('pending', 'accepted', 'rejected');

-- The qualitative judgement the app cannot make on its own (chapter 9).
create type problem_assessment as enum ('temporary', 'structural', 'not_assessed');

-- Financial statement kinds cached from the data provider.
create type statement_kind as enum ('income', 'balance', 'cash');

create type statement_frequency as enum ('annual', 'quarterly');

create type notification_kind as enum ('buy_signal', 'weekly_summary');

create type notification_state as enum ('sent', 'failed', 'skipped');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
