-- 0020_dual_language_thesis.sql
--
-- Stores the AI thesis in both languages.
--
-- Section 2 is explicit that generated content must exist in both languages
-- together, never one without the other. Storing a single `thesis` plus the
-- language it happened to be written in meant a Dutch reader saw Dutch chrome
-- wrapped around English prose. Both are now produced by one call and stored
-- side by side.

alter table ticker_summaries
  add column thesis_en text,
  add column thesis_nl text;

-- Carry existing rows across into the column matching the language they were
-- written in, so nothing is lost and nothing is mislabelled.
update ticker_summaries set thesis_en = thesis where lang = 'en';
update ticker_summaries set thesis_nl = thesis where lang = 'nl';

alter table ticker_summaries
  drop column thesis,
  drop column lang;

comment on column ticker_summaries.thesis_en is 'English thesis; both languages are written together.';
comment on column ticker_summaries.thesis_nl is 'Dutch thesis; both languages are written together.';
