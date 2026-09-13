-- 0015_shared_suggestions.sql
--
-- Suggestions are produced by the nightly scan, not by a person, and they feed
-- a shared watchlist — so they are household-wide rather than per-user.
--
-- The original shape assumed one user: user_id NOT NULL, unique on
-- (user_id, symbol). That cannot hold for a row the service role writes with no
-- session, and it would let the same ticker be suggested twice to one household.

alter table suggestions
  alter column user_id drop not null;

comment on column suggestions.user_id is
  'Null for scan-generated rows. Kept for suggestions raised by a person.';

-- Who accepted or dismissed it, which is the part worth attributing.
alter table suggestions
  add column decided_by uuid references auth.users (id);

comment on column suggestions.decided_by is
  'Household member who accepted or dismissed the suggestion.';

alter table suggestions drop constraint if exists suggestions_user_id_symbol_key;
drop index if exists suggestions_user_id_symbol_key;

create unique index suggestions_symbol_idx on suggestions (symbol);

-- The scan needs to find what is still pending, and what was dismissed long
-- enough ago to be offered again.
create index suggestions_state_until_idx on suggestions (state, rejected_until);

-- ---------------------------------------------------------------------------
-- watchlist_items: record where an item came from
-- ---------------------------------------------------------------------------
comment on column watchlist_items.added_via is
  'manual | seed | suggestion — how the ticker reached the watchlist.';

-- ---------------------------------------------------------------------------
-- qualitative_reviews: the Howard Marks answer already exists as marks_answer.
-- Reviews are per person per ticker, which the existing unique index already
-- enforces; this only records when the assessment was last changed, so the UI
-- can show how stale a judgement is.
-- ---------------------------------------------------------------------------
alter table qualitative_reviews
  add column assessed_at timestamptz;

comment on column qualitative_reviews.assessed_at is
  'When the temporary/structural judgement was last set, so staleness is visible.';
