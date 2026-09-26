-- 0043_universe_inactive.sql
--
-- Retire dead tickers from the scan and search domains (A4).
--
-- The static universe still lists companies that no longer trade — Discovery
-- (merged into WBD), Zynga and Xilinx (acquired), Aveva and Adevinta (taken
-- private), NortonLifeLock and FleetCor (renamed). They can't become suggestions
-- (no quote comes back), but they waste scan slots and inflate the "we check N"
-- figure. Rather than curate a list that goes stale, mark a row inactive once the
-- price pass has failed to get a quote for it three attempts running, and drop
-- inactive rows from both domains. A name that quotes again resets and revives.

alter table universe
  add column if not exists no_quote_streak integer not null default 0,
  add column if not exists inactive boolean not null default false;

-- One statement per outcome so the counter is atomic against the price pass's own
-- writes: quoted names reset (and revive), missed names advance and retire at 3.
create or replace function mark_quote_results(p_quoted text[], p_missed text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update universe
     set no_quote_streak = 0, inactive = false
   where symbol = any(p_quoted) and (no_quote_streak <> 0 or inactive);

  update universe
     set no_quote_streak = no_quote_streak + 1,
         inactive = (no_quote_streak + 1 >= 3)
   where symbol = any(p_missed);
end;
$$;

revoke all on function mark_quote_results(text[], text[]) from public;

comment on function mark_quote_results(text[], text[]) is
  'Advances the no-quote streak for missed symbols (retiring at 3) and resets quoted ones. Called by the nightly price pass.';
