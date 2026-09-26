-- 0040_price_pass.sql
--
-- The nightly price pass (A12b) and the priority queue it feeds.
--
-- Fundamentals barely move night to night, so the universe scan re-checks a name
-- only about once a week (focus sectors) or on a slow rotation (the rest). A
-- price, though, can fall 50% between two of those checks, and a 50% decline from
-- a company's own five-year high is the book's core entry signal. The price pass
-- runs at 02:12 — after the digest, before the scan — batch-quotes the large
-- universe cheaply (price + market cap only), and for a name that has just
-- *crossed* a 45% or 50% decline since its last full evaluation, writes the
-- symbol here. It also writes back real market caps for the names it quotes, so
-- the static size labels keep self-healing between scans (A1c).
--
-- The scan (02:15) drains this queue first, then walks its cursor with whatever
-- budget is left. Queuing rather than evaluating inline keeps the price pass fast
-- and bounded: a crash night that crosses thirty names at once spills into the
-- following nights' scan budgets instead of blowing the price pass through the
-- execution ceiling and losing the run.

create table scan_queue (
  symbol text primary key,
  -- Why it was queued (e.g. 'crossed -50%'). Telemetry only; the scan evaluates
  -- every queued name the same way regardless.
  reason text,
  -- The decline the crossing was measured at, a negative fraction (-0.51).
  drawdown numeric,
  queued_at timestamptz not null default now()
);

-- Service-role only, like scan_cursor: the price pass writes it and the scan
-- drains it, no user ever touches it. RLS on with no policy denies anon and
-- authenticated outright; the service role bypasses it.
alter table scan_queue enable row level security;

-- The price pass schedule, at 02:12 UTC — after the 02:10 digest and before the
-- 02:15 scan, so the scan always reads a queue the pass has finished writing. A
-- function, not a schedule, for the same reason as the others: it is invoked once
-- after deploy with the site URL and CRON_SECRET, which do not belong in a
-- migration.
create or replace function schedule_price_pass(
  site_url text,
  cron_secret text,
  schedule text default '12 2 * * *'
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

  perform cron.unschedule('price-pass')
  where exists (select 1 from cron.job where jobname = 'price-pass');

  select cron.schedule(
    'price-pass',
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
      rtrim(site_url, '/') || '/api/cron/price-pass',
      cron_secret
    )
  ) into job_id;

  return job_id;
end;
$$;

revoke all on function schedule_price_pass(text, text, text) from public;

comment on function schedule_price_pass(text, text, text) is
  'Creates the 02:12 UTC price-pass schedule. Call once after deploy with the site URL and CRON_SECRET.';
