-- 0014_household_auth.sql
--
-- Two real users (a household) behind Supabase magic-link auth, with an email
-- whitelist enforced in the database rather than only in the UI.
--
-- Sharing model, chosen per table rather than uniformly:
--
--   watchlist_items       shared across the household. Either member sees and
--                         edits every item; user_id records who added it.
--                         A watchlist is a shared research list — duplicating
--                         it per person would mean doing the same work twice.
--
--   qualitative_reviews   one per person per ticker. The book's review is a
--                         personal judgement ("is this problem temporary or
--                         structural?"), so it is not overwritten by the other
--                         member — but both can read each other's, because
--                         disagreeing about a stock is the useful part.
--
--   settings              strictly private. Language, thresholds and
--                         notification preferences belong to one person.
--
--   notifications_log     household-visible: both should see what was sent.

-- ---------------------------------------------------------------------------
-- Whitelist
-- ---------------------------------------------------------------------------
create table allowed_users (
  email      text primary key,
  label      text,
  added_at   timestamptz not null default now()
);

comment on table allowed_users is
  'Email whitelist. Sign-in is refused for anything not listed here.';

-- No policies: only the service role touches this table, so a signed-in user
-- can neither read the whitelist nor add themselves to it.
alter table allowed_users enable row level security;

/**
 * True when the caller's JWT email is whitelisted.
 *
 * SECURITY DEFINER so it can read allowed_users despite that table having no
 * policies. Marked STABLE so Postgres evaluates it once per statement rather
 * than once per row.
 */
create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from allowed_users a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_allowed_user() from public;
grant execute on function public.is_allowed_user() to authenticated;

-- ---------------------------------------------------------------------------
-- watchlist_items — shared across the household
-- ---------------------------------------------------------------------------
alter table watchlist_items
  add column is_shared boolean not null default true,
  add column updated_by uuid references auth.users (id);

comment on column watchlist_items.user_id is
  'Who added the item. Not an access boundary: shared items are household-wide.';
comment on column watchlist_items.is_shared is
  'True (default) makes the item visible and editable to the whole household.';

-- A shared list can only hold one row per ticker; a private one is per person.
--
-- The old uniqueness was (user_id, symbol), which would let each member add the
-- same ticker to the shared list separately. Dropping the constraint drops the
-- index that backs it, so the constraint has to go first.
alter table watchlist_items drop constraint if exists watchlist_items_user_id_symbol_key;
drop index if exists watchlist_items_user_id_symbol_key;

create unique index watchlist_items_shared_symbol_idx
  on watchlist_items (symbol) where is_shared;

create unique index watchlist_items_private_symbol_idx
  on watchlist_items (user_id, symbol) where not is_shared;

drop policy if exists watchlist_items_own on watchlist_items;

create policy watchlist_items_household on watchlist_items
  for all to authenticated
  using (public.is_allowed_user() and (is_shared or user_id = (select auth.uid())))
  with check (public.is_allowed_user() and (is_shared or user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- suggestions — shared, same reasoning as the watchlist
-- ---------------------------------------------------------------------------
drop policy if exists suggestions_own on suggestions;

create policy suggestions_household on suggestions
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());

-- ---------------------------------------------------------------------------
-- qualitative_reviews — readable by the household, writable only by the author
-- ---------------------------------------------------------------------------
drop policy if exists qualitative_reviews_own on qualitative_reviews;

create policy qualitative_reviews_read on qualitative_reviews
  for select to authenticated
  using (public.is_allowed_user());

create policy qualitative_reviews_write on qualitative_reviews
  for insert to authenticated
  with check (public.is_allowed_user() and user_id = (select auth.uid()));

create policy qualitative_reviews_update on qualitative_reviews
  for update to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()))
  with check (public.is_allowed_user() and user_id = (select auth.uid()));

create policy qualitative_reviews_delete on qualitative_reviews
  for delete to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()));

drop policy if exists qualitative_notes_own on qualitative_notes;

create policy qualitative_notes_read on qualitative_notes
  for select to authenticated
  using (public.is_allowed_user());

create policy qualitative_notes_write on qualitative_notes
  for insert to authenticated
  with check (public.is_allowed_user() and user_id = (select auth.uid()));

create policy qualitative_notes_update on qualitative_notes
  for update to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()))
  with check (public.is_allowed_user() and user_id = (select auth.uid()));

create policy qualitative_notes_delete on qualitative_notes
  for delete to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- settings — strictly private
-- ---------------------------------------------------------------------------
drop policy if exists settings_own on settings;

create policy settings_own on settings
  for all to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()))
  with check (public.is_allowed_user() and user_id = (select auth.uid()));

-- Each member gets their own alert address; the daily job reads these.
alter table settings
  add column notify_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- notifications_log — household-visible
-- ---------------------------------------------------------------------------
drop policy if exists notifications_log_own_read on notifications_log;

create policy notifications_log_read on notifications_log
  for select to authenticated
  using (public.is_allowed_user());

-- One buy-signal mail per recipient per ticker per day, rather than per user
-- row: the same alert goes to both members and each delivery is logged.
drop index if exists notifications_log_dedupe_idx;

create unique index notifications_log_dedupe_idx
  on notifications_log (recipient, kind, coalesce(symbol, ''), as_of);

-- ---------------------------------------------------------------------------
-- Reference data: reading it still requires being on the whitelist
-- ---------------------------------------------------------------------------
drop policy if exists universe_read on universe;
drop policy if exists daily_snapshots_read on daily_snapshots;
drop policy if exists ratios_read on ratios;
drop policy if exists signal_history_read on signal_history;
drop policy if exists news_items_read on news_items;
drop policy if exists news_summaries_read on news_summaries;
drop policy if exists earnings_calendar_read on earnings_calendar;
drop policy if exists market_context_read on market_context;
drop policy if exists translations_read on translations;
drop policy if exists sector_mapping_rw on sector_mapping;

create policy universe_read          on universe          for select to authenticated using (public.is_allowed_user());
create policy daily_snapshots_read   on daily_snapshots   for select to authenticated using (public.is_allowed_user());
create policy ratios_read            on ratios            for select to authenticated using (public.is_allowed_user());
create policy signal_history_read    on signal_history    for select to authenticated using (public.is_allowed_user());
create policy news_items_read        on news_items        for select to authenticated using (public.is_allowed_user());
create policy news_summaries_read    on news_summaries    for select to authenticated using (public.is_allowed_user());
create policy earnings_calendar_read on earnings_calendar for select to authenticated using (public.is_allowed_user());
create policy market_context_read    on market_context    for select to authenticated using (public.is_allowed_user());
create policy translations_read      on translations      for select to authenticated using (public.is_allowed_user());

create policy sector_mapping_rw on sector_mapping
  for all to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
