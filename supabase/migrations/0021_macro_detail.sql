-- 0021_macro_detail.sql
--
-- A place for the nightly job to keep small pieces of its own state.
--
-- The universe scan walks ~6,800 candidates a batch at a time, so it has to
-- remember where it stopped. That belongs with the day's row rather than in a
-- table of its own.

alter table macro_context
  add column detail jsonb not null default '{}'::jsonb;

comment on column macro_context.detail is
  'Nightly-job state, e.g. the universe scan cursor.';
