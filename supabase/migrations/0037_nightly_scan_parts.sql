-- 0037_nightly_scan_parts.sql
--
-- The watchlist pass runs in slices now, and the digest runs on its own.
--
-- Why: the single 02:00 nightly-scan request fetched the whole watchlist in one
-- go. That was ~40s until EDGAR fundamentals came back into it on 09-21, which
-- pushed it into the high-40s/low-50s against a ~60s execution ceiling this plan
-- kills requests at. On 09-24 and 09-25 it crossed the line and was killed
-- before it persisted anything, so every watchlist figure froze at 09-23 while
-- the separate universe scan kept running fine. (See the Log in NEXT-STEPS.md
-- and RUN_CEILING_MS in scanBudget.ts.)
--
-- The fix is the same shape as splitting the universe scan out earlier: give the
-- work more than one request. The watchlist is cut into `parts` index-slices,
-- one pg_cron schedule per slice a few minutes apart, each well under the
-- ceiling. The route takes ?part=i&parts=n and does its slice only; the first
-- slice also does the once-a-night macro refresh.
--
-- The digest can no longer be sent from the nightly pass, because no single
-- slice sees the whole watchlist to summarise it. /api/cron/digest already
-- assembles it from the stored signals and is idempotent per recipient per day,
-- so it gets its own schedule after the slices have run.
--
-- These are functions, not schedules: like schedule_nightly_scan before them,
-- they are invoked once after deploy with the site URL and CRON_SECRET, which
-- do not belong in a migration.

-- The sliced watchlist. Replaces the old single 'nightly-scan' schedule and any
-- previous slice schedules, then creates one per part.
create or replace function schedule_nightly_scan_parts(
  site_url text,
  cron_secret text,
  parts int default 3,
  first_minute int default 0,
  spacing_minutes int default 3
)
returns int
language plpgsql
security definer
set search_path = public, cron, net
as $$
declare
  job record;
  i int;
  job_minute int;
begin
  if site_url is null or cron_secret is null then
    raise exception 'site_url and cron_secret are both required';
  end if;
  if parts < 1 then
    raise exception 'parts must be at least 1';
  end if;

  -- Clear the old single schedule and any slices from a previous run, so
  -- re-invoking this never stacks two sets firing the same work.
  for job in
    select jobname from cron.job
    where jobname = 'nightly-scan' or jobname like 'nightly-scan-p%'
  loop
    perform cron.unschedule(job.jobname);
  end loop;

  for i in 0 .. parts - 1 loop
    job_minute := first_minute + i * spacing_minutes;
    perform cron.schedule(
      format('nightly-scan-p%s', i),
      format('%s 2 * * *', job_minute),
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
        rtrim(site_url, '/') || format('/api/cron/nightly-scan?part=%s&parts=%s', i, parts),
        cron_secret
      )
    );
  end loop;

  return parts;
end;
$$;

revoke all on function schedule_nightly_scan_parts(text, text, int, int, int) from public;

comment on function schedule_nightly_scan_parts(text, text, int, int, int) is
  'Replaces the nightly-scan schedule with `parts` staggered slice schedules '
  '(nightly-scan-p0..). Call once after deploy with the site URL and CRON_SECRET.';

-- The daily digest, on its own schedule, after the slices.
create or replace function schedule_daily_digest(
  site_url text,
  cron_secret text,
  schedule text default '10 2 * * *'
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

  perform cron.unschedule('daily-digest')
  where exists (select 1 from cron.job where jobname = 'daily-digest');

  select cron.schedule(
    'daily-digest',
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
        timeout_milliseconds := 60000
      );
      $cmd$,
      rtrim(site_url, '/') || '/api/cron/digest',
      cron_secret
    )
  ) into job_id;

  return job_id;
end;
$$;

revoke all on function schedule_daily_digest(text, text, text) from public;

comment on function schedule_daily_digest(text, text, text) is
  'Creates the 02:10 UTC daily-digest schedule. Call once after deploy with the site URL and CRON_SECRET.';
