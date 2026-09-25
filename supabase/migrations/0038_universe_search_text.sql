-- 0038_universe_search_text.sql
--
-- Accent- and punctuation-insensitive search over company names.
--
-- The trigram index from 0024 sits on the raw `name`, so ILIKE is
-- case-insensitive but not accent-insensitive: "hermes" does not match
-- "Hermès International", and "coca cola" does not match "Coca-Cola" because the
-- hyphen breaks the substring. A subscriber typing a company name the ordinary
-- way got "nothing matches".
--
-- The fix is a folded column. `search_text` lowercases the name and maps the
-- common Western-European accented letters to their ASCII base with translate()
-- — which, unlike unaccent(), is a built-in immutable function, so the column
-- can be STORED and generated with no extension, no backfill and no change to
-- the import script. The query side folds the same way in JS (NFD strip), and a
-- multi-word query becomes a '%'-joined pattern, so spaces and hyphens both
-- match across the gap. The trigram GIN index keeps a substring search off a
-- sequential scan, the way 0024 did for the raw name.

alter table universe
  add column search_text text generated always as (
    translate(
      lower(coalesce(name, '')),
      'àáâãäåèéêëìíîïòóôõöøùúûüýÿçñ',
      'aaaaaaeeeeiiiioooooouuuuyycn'
    )
  ) stored;

create index universe_search_text_trgm_idx on universe using gin (search_text gin_trgm_ops);
