-- 0034_universe_scan_schedule.sql
--
-- The universe scan gets its own schedule, because it needs its own request.
--
-- It used to run at the tail of the nightly job on whatever time the watchlist
-- had left. That was a sound division of a budget that turned out not to
-- exist. Probed against the deployment, a request here is killed at roughly
-- sixty seconds of execution — the route asks for three hundred and does not
-- get them — and the watchlist spends about forty. What was left over was
-- never enough to fetch one candidate, so for three nights the scan started
-- and was killed mid-fetch.
--
-- Splitting it does not raise the ceiling. It gives the scan a whole request
-- to spend instead of the end of someone else's, and stops a slow provider on
-- an unwatched company from being able to take the digest down with it.
--
-- 02:15 UTC, a quarter of an hour behind the watchlist: long enough that the
-- two are never in flight together, close enough that both still run against
-- the same night's prices.

create or replace function schedule_universe_scan(
  site_url text,
  cron_secret text,
  schedule text default '15 2 * * *'
)
returns bigint
language plpgsql
security definer
set search_path = public, cron, net
as $$
declare
  job_id bigint;
begin
  if site_url is null or cron_secret is null then
    raise exception 'site_url and cron_secret are both required';
  end if;

  -- Replace rather than stack: re-running this must not leave two schedules
  -- firing the same job.
  perform cron.unschedule('universe-scan')
  where exists (select 1 from cron.job where jobname = 'universe-scan');

  select cron.schedule(
    'universe-scan',
    schedule,
    format(
      $cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', %L
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 90000
      );
      $cmd$,
      rtrim(site_url, '/') || '/api/cron/universe-scan',
      cron_secret
    )
  ) into job_id;

  return job_id;
end;
$$;

revoke all on function schedule_universe_scan(text, text, text) from public;

comment on function schedule_universe_scan(text, text, text) is
  'Creates the 02:15 UTC universe-scan schedule. Call once after deploy with the site URL and CRON_SECRET.';
