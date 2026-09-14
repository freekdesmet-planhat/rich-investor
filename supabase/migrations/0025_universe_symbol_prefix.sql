-- 0025_universe_symbol_prefix.sql
--
-- Replaces the symbol index added in 0024 with one the search can actually use.
--
-- 0024 indexed `lower(symbol)`, on the assumption that a case-insensitive
-- prefix match would use it. It does not: PostgREST emits `symbol ILIKE 'x%'`,
-- which cannot use an index on `lower(symbol)` — the expression in the query
-- has to match the expression in the index, and there is no way to make
-- PostgREST write `lower(symbol) LIKE …`. Measured, that left symbol matching
-- as a sequential scan over 102,285 rows at ~250ms per search.
--
-- `text_pattern_ops` on the column itself is what serves a prefix LIKE, so the
-- query uppercases the input (every symbol in this table is uppercase) and uses
-- a case-sensitive `LIKE 'ASML%'` against it.

drop index if exists universe_symbol_lower_idx;

create index universe_symbol_prefix_idx on universe (symbol text_pattern_ops);
