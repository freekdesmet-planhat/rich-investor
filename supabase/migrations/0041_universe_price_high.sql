-- 0041_universe_price_high.sql
--
-- The five-year high, cached on the universe row, for the price pass (A12b).
--
-- The price pass fetches a price but no history, so it cannot compute a decline
-- on its own — it needs the five-year high from the name's last full evaluation.
-- That figure lived only in the drawdown_5y ratio, and the scan persists ratios
-- for suggested names only, so the ~293 focus names it evaluates every cycle kept
-- no high and could not be triggered. The first hand-run of the price pass found
-- exactly eight of a 466-name cohort trigger-eligible for this reason.
--
-- So the high and the decline against it move onto the universe row, written back
-- by every full evaluation the same way the real market cap is (A1c). Over one
-- scan cycle the focus universe fills in, and the price pass can then recompute
-- each name's decline against today's price and catch it crossing the entry line.
-- drawdown_5y here is the decline *at that last evaluation* — the baseline the
-- price pass measures a fresh crossing against, so a name already below the line
-- does not re-trigger every night.

alter table universe
  add column if not exists price_high_5y numeric,
  add column if not exists drawdown_5y numeric;
