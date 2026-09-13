-- 0008_snapshot_provenance.sql
-- Records which source supplied each statement, and the currency the filings
-- are reported in.
--
-- Statements now come from SEC EDGAR where available (full filing history and
-- an explicit currency) and fall back to the quote provider's shorter history
-- otherwise, so a snapshot has to say which it was.
--
-- The filing currency matters because it is not always the trading currency:
-- ASML trades in USD on NasdaqGS and reports in EUR, so any ratio dividing a
-- price by a per-share figure has to convert first.

alter table daily_snapshots
  add column filing_currency text,
  add column statement_sources jsonb not null default '{}'::jsonb;

comment on column daily_snapshots.filing_currency is
  'Currency of the financial statements, which may differ from the quote currency.';
comment on column daily_snapshots.statement_sources is
  'Per statement kind, the provider that supplied it: {"income":"sec-edgar",...}.';
