-- 0022_nightly_cron.sql
--
-- Schedules the nightly job.
--
-- pg_cron fires inside Postgres and pg_net makes the outbound call, so the
-- schedule lives with the data rather than in a second platform's config. The
-- deployed URL and the shared secret are not known at migration time, so this
-- migration installs the extensions and a helper, and the schedule itself is
-- created once after deploy by calling:
--
--   select schedule_nightly_scan('https://your-app.netlify.app', '<CRON_SECRET>');
--
-- 02:00 UTC is comfortably after the US close (20:00 or 21:00 UTC), which is
-- the reason for running at night at all. The original brief said 23:00
-- Europe/Amsterdam; 02:00 UTC is the same idea with more margin.

create extension if not exists pg_cron;
create extension if not exists pg_net;

/**
 * Creates or replaces the nightly schedule.
 *
 * The secret is passed as a header rather than a query parameter so it does not
 * end up in access logs. Returns the cron job id.
 */
create or replace function schedule_nightly_scan(
  site_url text,
  cron_secret text,
  schedule text default '0 2 * * *'
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
  perform cron.unschedule('nightly-scan')
  where exists (select 1 from cron.job where jobname = 'nightly-scan');

  select cron.schedule(
    'nightly-scan',
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
        timeout_milliseconds := 300000
      );
      $cmd$,
      rtrim(site_url, '/') || '/api/cron/nightly-scan',
      cron_secret
    )
  ) into job_id;

  return job_id;
end;
$$;

revoke all on function schedule_nightly_scan(text, text, text) from public;

comment on function schedule_nightly_scan(text, text, text) is
  'Creates the 02:00 UTC nightly-scan schedule. Call once after deploy with the site URL and CRON_SECRET.';
