-- 0017_watchlist_unique_symbol.sql
--
-- One watchlist row per ticker, full stop.
--
-- 0014 split uniqueness into two partial indexes, one for shared items and one
-- for private ones. Postgres will not accept a partial unique index as an
-- ON CONFLICT target unless the statement repeats its WHERE clause, which
-- PostgREST cannot express — so every upsert onto the watchlist failed with
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
--
-- The household shares one watchlist, so a single row per ticker is what the
-- design actually wants. `is_shared` now controls visibility only, and a ticker
-- is on the list once regardless of who put it there.

drop index if exists watchlist_items_shared_symbol_idx;
drop index if exists watchlist_items_private_symbol_idx;

create unique index watchlist_items_symbol_idx on watchlist_items (symbol);

comment on column watchlist_items.is_shared is
  'Visibility only. Uniqueness is per ticker: the household keeps one list.';
