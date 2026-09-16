-- 0031_cron_runs.sql
--
-- What the nightly job actually did, kept where it can be read back.
--
-- The run has always produced a detailed account of itself — a per-stage log,
-- the budget it computed, the counts, the invariant violations — and returned
-- the whole thing as an HTTP response body to pg_net, which discards it. So the
-- only surviving trace of a night was its side effects, and the one question
-- worth asking was the one nobody could answer: did the scan run?
--
-- It had not, for three nights. The cursor sat at 451 and even went backwards
-- once, because a night that skipped the scan and a night whose scan failed and
-- a night whose scan ran and found nothing all looked exactly alike from the
-- outside: no new suggestions, and a cursor that had not moved.
--
-- One row per run, written at the end whatever happened, including when a stage
-- threw. `stages` holds a per-stage record rather than columns per stage, so a
-- stage added later needs no migration; the columns here are only the fields
-- worth indexing or scanning by eye.

create type cron_run_status as enum ('ok', 'partial', 'failed');

create table cron_runs (
  id            uuid primary key default gen_random_uuid(),

  job           text not null default 'nightly-scan',
  started_at    timestamptz not null,
  finished_at   timestamptz not null default now(),
  duration_ms   integer not null,

  -- 'partial' is the interesting one: the watchlist succeeded and the scan did
  -- not, which is precisely the state that used to be invisible.
  status        cron_run_status not null,

  -- Per stage: { "watchlist": { "ok": true, "durationMs": 61000, "count": 32 },
  --              "scan": { "ok": false, "error": "...", "skippedReason": "exhausted" } }
  stages        jsonb not null default '{}'::jsonb,

  -- Denormalised out of `stages` for the at-a-glance query, because "how many
  -- did it look at" is the question asked of this table most often.
  watchlist_evaluated integer,
  scan_evaluated      integer,
  scan_suggested      integer,
  scan_cursor_before  integer,
  scan_cursor_after   integer,

  -- The first failure, promoted out of `stages` so a failed night is greppable
  -- without digging into JSON. The stack is kept whole because the useful part
  -- of a provider error is usually three frames in.
  error_stage   text,
  error_message text,
  error_stack   text,

  -- The progress lines the run emitted, in order.
  log           text[] not null default '{}',

  created_at    timestamptz not null default now()
);

create index cron_runs_started_idx on cron_runs (started_at desc);
create index cron_runs_status_idx  on cron_runs (status) where status <> 'ok';

comment on table cron_runs is
  'One row per nightly pipeline run: stage outcomes, counts, cursor movement and errors. Written even when a stage throws.';

alter table cron_runs enable row level security;

-- Written by the job under the service role, which bypasses RLS entirely. The
-- household only reads it — there is nothing here a person should be able to
-- write, and a run record that could be edited would be worth less than none.
create policy cron_runs_read on cron_runs
  for select to authenticated using (public.is_allowed_user());
