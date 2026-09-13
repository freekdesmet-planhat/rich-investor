-- 0007_row_level_security.sql
-- RLS for a single-user app (Supabase Auth, magic link).
--
-- Two shapes:
--   * Owned tables  — rows carry user_id; the signed-in user sees only their own.
--   * Shared tables — market data and reference data, readable by any signed-in
--     user and written only by the daily job, which uses the service role key
--     and therefore bypasses RLS. No write policy is granted to `authenticated`,
--     except on sector_mapping and translations, which the settings screen edits.

-- ---------------------------------------------------------------------------
-- Owned tables
-- ---------------------------------------------------------------------------
alter table watchlist_items     enable row level security;
alter table suggestions         enable row level security;
alter table qualitative_reviews enable row level security;
alter table qualitative_notes   enable row level security;
alter table settings            enable row level security;
alter table notifications_log   enable row level security;

create policy watchlist_items_own on watchlist_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy suggestions_own on suggestions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy qualitative_reviews_own on qualitative_reviews
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy qualitative_notes_own on qualitative_notes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy settings_own on settings
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The log is written by the job (service role); the user only reads it.
create policy notifications_log_own_read on notifications_log
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Shared tables: read-only for the signed-in user
-- ---------------------------------------------------------------------------
alter table universe          enable row level security;
alter table daily_snapshots   enable row level security;
alter table ratios            enable row level security;
alter table signal_history    enable row level security;
alter table news_items        enable row level security;
alter table news_summaries    enable row level security;
alter table earnings_calendar enable row level security;
alter table market_context    enable row level security;

create policy universe_read          on universe          for select to authenticated using (true);
create policy daily_snapshots_read   on daily_snapshots   for select to authenticated using (true);
create policy ratios_read            on ratios            for select to authenticated using (true);
create policy signal_history_read    on signal_history    for select to authenticated using (true);
create policy news_items_read        on news_items        for select to authenticated using (true);
create policy news_summaries_read    on news_summaries    for select to authenticated using (true);
create policy earnings_calendar_read on earnings_calendar for select to authenticated using (true);
create policy market_context_read    on market_context    for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Shared tables the settings screen may edit
-- ---------------------------------------------------------------------------
alter table sector_mapping enable row level security;
alter table translations   enable row level security;

create policy sector_mapping_rw on sector_mapping
  for all to authenticated using (true) with check (true);

create policy translations_read on translations
  for select to authenticated using (true);
