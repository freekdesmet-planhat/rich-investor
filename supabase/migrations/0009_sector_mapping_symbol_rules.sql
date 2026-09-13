-- 0009_sector_mapping_symbol_rules.sql
-- Adds symbol-level rules to the sector mapping.
--
-- FinanceDatabase's own sector/industry labels disagree with the book for
-- several of its headline companies, so (sector, industry) rules alone cannot
-- express the intended focus:
--
--   META, GOOGL  labelled "Diversified Telecommunication Services", alongside
--                ~2000 actual telcos. Mapping that industry to the
--                entertainment/interactive-media focus would pull in every
--                telco; leaving it out drops the book's two main examples.
--   ADYEN.AS     labelled Information Technology / Software, though the book
--                treats it as a payment processor.
--   EL.PA        labelled Health Care, though the book treats EssilorLuxottica
--                as a luxury-goods company.
--
-- A symbol rule wins over an industry rule, which wins over a sector rule.

alter table sector_mapping
  add column symbol text;

-- Make `sector` optional: a symbol rule needs no sector.
alter table sector_mapping
  alter column sector drop not null;

alter table sector_mapping
  add constraint sector_mapping_scope_check
  check (symbol is not null or sector is not null);

-- Replaces the (sector, industry) unique index so symbol rules are unique too.
drop index if exists sector_mapping_unique_idx;

create unique index sector_mapping_unique_idx
  on sector_mapping (coalesce(symbol, ''), coalesce(sector, ''), coalesce(industry, ''));

comment on column sector_mapping.symbol is
  'When set, this rule applies to exactly one ticker and overrides sector/industry rules.';
comment on column sector_mapping.specificity is
  'Higher wins: 100 for a symbol rule, 10 for sector+industry, 0 for sector only.';
