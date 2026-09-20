-- 0033_cron_runs_timed_out.sql
--
-- A run that never came back should stop claiming to be running.
--
-- 0032 made a killed run leave a row behind, which is what finally located the
-- failure. But the row it leaves says `running`, and it says it forever: the
-- process that would have corrected it is the one that died. One dead row is
-- evidence; a column of them, one a night, is noise that makes the next real
-- incident harder to see.
--
-- `timed_out` is its own status rather than `failed`, because it is a
-- different fact about a different thing. `failed` means the code ran and
-- something in it went wrong, and there is an error and a stack to read.
-- `timed_out` means the code stopped existing, which is not the same claim and
-- has no error to show for it.
--
-- `duration_ms` stays null on these. The run's real end time is unknown — all
-- that is known is when somebody noticed — and filling it with the moment of
-- noticing would put a made-up number where an honest gap belongs.

alter type cron_run_status add value if not exists 'timed_out';

comment on column cron_runs.duration_ms is
  'Null for a run that was killed: only its start is known, never its end.';
