-- 0039_scan_cursor.sql
--
-- A single, atomically-claimable cursor for the universe scan.
--
-- The scan is about to run in four slices a night (02:15/20/25/30) instead of
-- one, to get a full pass of the screened universe down from ~4 months to ~4
-- weeks. Four slices sharing a cursor is a concurrency problem the old storage
-- could not solve: the cursor lived in macro_context.detail as JSON, read as
-- "the most recent value that exists" and written back read-modify-write, so two
-- slices that overlapped — one running long, one retried — would read the same
-- value and evaluate the same names against an unofficial, single-IP quote
-- provider. That is exactly the traffic we must not double.
--
-- So the cursor moves to its own one-row table and is claimed in a single
-- locked statement: claim_scan_batch() reserves [start, start+claim) and returns
-- start, so no two callers can ever get the same range. The breaker_date is the
-- circuit breaker: a slice that sees the provider throttling sets it to today,
-- and the remaining slices that night read it and skip rather than keep hammering
-- a provider that is already rate-limiting us. ms_per_candidate is the cost
-- estimate the budget uses, moved here from macro_context so all scan state lives
-- in one place.

create table scan_cursor (
  id boolean primary key default true,
  cursor integer not null default 0,
  ms_per_candidate numeric,
  breaker_date date,
  updated_at timestamptz not null default now(),
  constraint scan_cursor_singleton check (id)
);

-- Service-role only: the cron writes it, no user ever reads or writes it. RLS on
-- with no policy denies anon and authenticated outright; the service role and the
-- SECURITY DEFINER functions below bypass it.
alter table scan_cursor enable row level security;

-- Seed from wherever the JSON cursor had got to, so the switch does not re-walk
-- the universe from zero.
insert into scan_cursor (id, cursor)
values (
  true,
  coalesce(
    (select max((detail ->> 'scan_cursor')::int) from macro_context where detail ? 'scan_cursor'),
    0
  )
)
on conflict (id) do nothing;

-- Atomically reserve a batch of `p_claim` rows and return the offset to start at.
-- The row lock makes the read-and-advance a single critical section, so two
-- slices always get disjoint ranges even if one overruns into the next.
create or replace function claim_scan_batch(p_claim integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  start_at integer;
begin
  if p_claim < 1 then
    p_claim := 1;
  end if;
  select cursor into start_at from scan_cursor where id for update;
  update scan_cursor set cursor = start_at + p_claim, updated_at = now() where id;
  return start_at;
end;
$$;

revoke all on function claim_scan_batch(integer) from public;

-- Reset to the start of the universe, called by the slice that runs off the end.
create or replace function reset_scan_cursor()
returns void
language sql
security definer
set search_path = public
as $$
  update scan_cursor set cursor = 0, updated_at = now() where id;
$$;

revoke all on function reset_scan_cursor() from public;

comment on table scan_cursor is
  'One row. The universe-scan cursor, its cost estimate and its circuit breaker. '
  'Claimed atomically by claim_scan_batch() so parallel slices never overlap.';
