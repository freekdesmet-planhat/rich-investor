-- 0011_snapshot_estimates_source.sql
-- Records which source supplied the analyst estimates.
--
-- Estimates now come from a fallback chain: FMP first, then yahoo-finance2 for
-- everything FMP's free tier refuses (12 of the 27 seed tickers, including all
-- six EU-only listings). A snapshot has to say which one answered, because the
-- two disagree slightly and a stored figure should be traceable to its source.

alter table daily_snapshots
  add column estimates_source text;

comment on column daily_snapshots.estimates_source is
  'Provider that supplied `estimates`: financial-modeling-prep, yahoo-finance2, or null.';
