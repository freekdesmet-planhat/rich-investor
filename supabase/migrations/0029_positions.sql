-- 0029_positions.sql
--
-- Whether you actually own the thing.
--
-- The qualitative review carries the book's full sell-signal checklist —
-- deteriorating performance, an acquisition at a high premium, a CFO leaving
-- involuntarily, unusual insider selling. Every one of those is a question
-- about a holding, and the app has never known whether there is one. Half the
-- framework was a questionnaire about a hypothetical, and the return that a
-- sell decision actually hangs on appeared nowhere.
--
-- Per person, like the review and for the same reason: a household shares a
-- watchlist and an analysis, but not a portfolio. One open position per person
-- per ticker — averaging down is a change to the entry, not a second row, and
-- anything more than that is a portfolio tracker rather than the one number
-- the sell checklist needs.

create table positions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  symbol      text not null,

  -- What was paid per share, in the currency the shares trade in — the same
  -- currency the quote arrives in, so the return needs no conversion and none
  -- is invented.
  entry_price numeric not null check (entry_price > 0),
  entry_date  date not null,
  currency    text,

  -- Optional: plenty of people remember what they paid and not how many.
  -- Without it the return is still a percentage, just not an amount.
  quantity    numeric check (quantity is null or quantity > 0),

  note        text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (user_id, symbol)
);

create index positions_user_idx on positions (user_id);

comment on table positions is
  'An open holding, per person per ticker. Turns the sell-signal checklist from a hypothetical into a review of something owned.';

create trigger positions_set_updated_at
  before update on positions
  for each row execute function set_updated_at();

alter table positions enable row level security;

-- Yours alone. The household shares what the market says about a company; what
-- you own is not that.
create policy positions_read on positions
  for select to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()));

create policy positions_write on positions
  for insert to authenticated
  with check (public.is_allowed_user() and user_id = (select auth.uid()));

create policy positions_update on positions
  for update to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()))
  with check (public.is_allowed_user() and user_id = (select auth.uid()));

create policy positions_delete on positions
  for delete to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()));
