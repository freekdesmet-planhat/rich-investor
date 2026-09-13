-- 0010_sector_mapping_conflict_target.sql
-- Makes the sector_mapping uniqueness usable as an ON CONFLICT target.
--
-- 0009 expressed it as an index over coalesce(...) expressions. Postgres will
-- not accept an expression index as an ON CONFLICT target, so upserting the
-- seed rules failed with "no unique or exclusion constraint matching the
-- ON CONFLICT specification".
--
-- A plain index over the three columns works instead, provided NULLs compare as
-- equal -- otherwise two sector-only rules, both with a NULL symbol and
-- industry, would not conflict. NULLS NOT DISTINCT does exactly that
-- (Postgres 15+; this project runs 17).

drop index if exists sector_mapping_unique_idx;

create unique index sector_mapping_unique_idx
  on sector_mapping (symbol, sector, industry) nulls not distinct;
