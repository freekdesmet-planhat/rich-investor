-- 0030_analysis_settings.sql
--
-- The thresholds the app chose for itself, once the household has chosen
-- otherwise.
--
-- Household-wide rather than per person, and the reason is the same one that
-- decides everything else in this schema: the watchlist and the analysis are
-- shared, the judgement and the holdings are not. A threshold decides what the
-- nightly job calls buy-worthy, and that job runs once for everyone — so a
-- per-user threshold would mean one of the two members' numbers silently
-- deciding the signal both of them read. `settings.thresholds` exists and stays
-- unused for exactly that reason.
--
-- A single row, enforced: `only_row` can only ever be true, so there is one set
-- of numbers and no question of which applies.
--
-- Only the five thresholds the app admits it invented can be stored here. The
-- book's fourteen are not editable at all, which the application enforces from
-- the `source` field rather than from a list kept in two places.

create table analysis_settings (
  only_row   boolean primary key default true check (only_row),

  -- { "evEbit": { "green": 15 }, ... } — sparse, so a field left alone keeps
  -- following the app default rather than being frozen at today's value.
  thresholds jsonb not null default '{}'::jsonb,

  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

comment on table analysis_settings is
  'Household-wide overrides for the thresholds the app chose itself. One row. The book''s thresholds are not overridable.';

create trigger analysis_settings_set_updated_at
  before update on analysis_settings
  for each row execute function set_updated_at();

alter table analysis_settings enable row level security;

-- Shared, like the analysis it governs: any member of the household may read
-- and change it, and the row records who last did.
create policy analysis_settings_read on analysis_settings
  for select to authenticated using (public.is_allowed_user());

create policy analysis_settings_write on analysis_settings
  for insert to authenticated with check (public.is_allowed_user());

create policy analysis_settings_update on analysis_settings
  for update to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user());
