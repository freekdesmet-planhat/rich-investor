-- 0027_review_history.sql
--
-- Keeps what you concluded last time.
--
-- `qualitative_reviews` is unique on (user_id, symbol) and upserted, so every
-- save overwrites the one before it. The judgement itself is the one thing in
-- this app nobody else can supply — the ratios can be recomputed from providers,
-- the summaries regenerated, but "I decided in March this was a temporary
-- problem, and by June I had changed my mind" exists nowhere once it is
-- overwritten. That change of mind is exactly what a review is for.
--
-- An append-only log beside the current row, rather than versioning the row
-- itself: reading the current review stays a single-row lookup, and the history
-- is only fetched by the page that shows it.

create table qualitative_review_history (
  id           uuid primary key default gen_random_uuid(),
  review_id    uuid not null references qualitative_reviews (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  symbol       text not null,

  -- The state as saved, copied rather than referenced: a history entry has to
  -- keep meaning after the current row moves on.
  assessment   problem_assessment not null,
  catalysts    text[] not null default '{}',
  sell_signals text[] not null default '{}',
  marks_answer text,

  saved_at     timestamptz not null default now()
);

create index qualitative_review_history_idx
  on qualitative_review_history (user_id, symbol, saved_at desc);

comment on table qualitative_review_history is
  'Append-only log of every saved review. The current state lives in qualitative_reviews; this is what it used to say.';

alter table qualitative_review_history enable row level security;

-- Your own history only. A household shares the watchlist and the analysis, but
-- a judgement belongs to the person who made it, exactly as the review does.
create policy qualitative_review_history_read on qualitative_review_history
  for select to authenticated
  using (public.is_allowed_user() and user_id = (select auth.uid()));

create policy qualitative_review_history_write on qualitative_review_history
  for insert to authenticated
  with check (public.is_allowed_user() and user_id = (select auth.uid()));
