-- 0024_universe_search.sql
--
-- Makes the universe searchable.
--
-- `universe` holds 102,285 rows and had no index on `name`, so the obvious
-- query behind a search box — name ILIKE '%…%' — was a sequential scan over all
-- of them. Measured against this database: "adobe" returned in 235ms because
-- few rows match and the limit is reached early, but "bank" took **69.9
-- seconds**. A search box wired to that would hang the page and hold a
-- connection open for over a minute per keystroke.
--
-- A trigram GIN index is the fix that fits the query shape: unlike a btree it
-- serves substring matches, so "nvid" finds "NVIDIA Corporation" rather than
-- only prefixes, and ILIKE uses it directly without rewriting the query.
--
-- The symbol side needs nothing new — `symbol` is the primary key, so a prefix
-- match already uses that index.

create extension if not exists pg_trgm;

-- Names are what people type. gin_trgm_ops is what makes ILIKE '%x%' indexable.
create index universe_name_trgm_idx on universe using gin (name gin_trgm_ops);

-- Exact and prefix lookups on a lowercased symbol, for "adbe" finding "ADBE"
-- without the caller having to know the casing.
create index universe_symbol_lower_idx on universe (lower(symbol) text_pattern_ops);
