-- 0032_cron_runs_in_flight.sql
--
-- A run that dies mid-flight has to leave a row behind.
--
-- 0031 wrote one row per run, at the end. That records every outcome the code
-- can reach — and none of the ones it cannot. Three nights running, the job
-- completed its watchlist pass, started the universe scan and then stopped:
-- no cron_runs row, no saved cursor, and not one snapshot from the scan. The
-- route's own catch would have recorded an exception, and the insert has been
-- verified to work, so nothing in JavaScript ran at all. The process is being
-- taken away from us, and a table written on the way out cannot say so.
--
-- So the row is inserted when the run starts and updated as it goes. A row
-- still sitting at 'running' long after its `started_at` is the evidence that
-- was missing: it names the stage that was in flight when the lights went out.
--
-- `finished_at` and `duration_ms` become nullable, because they are now facts
-- about a run that ended, and the whole point is to record the ones that did
-- not.

alter type cron_run_status add value if not exists 'running';

alter table cron_runs
  alter column finished_at drop not null,
  alter column finished_at drop default,
  alter column duration_ms drop not null;

comment on column cron_runs.finished_at is
  'Null while the run is in flight, and for a run that was killed before it could finish.';

-- Finding the killed runs is the query this table now exists to answer, so it
-- gets an index rather than a sequential scan over every night ever recorded.
create index cron_runs_unfinished_idx on cron_runs (started_at desc)
  where finished_at is null;
