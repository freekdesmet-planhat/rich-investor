-- 0023_thesis_per_language.sql
--
-- One cached thesis per ticker per language, and an end to placeholder rows.
--
-- Two things were wrong with the previous shape.
--
-- First, `thesis_en` and `thesis_nl` on one row came from one API call that was
-- asked for both languages at once. That call did not fit in its token ceiling,
-- so in practice neither column was ever filled by a successful generation. Each
-- language is now generated separately and cached separately, keyed on
-- (symbol, lang) — either language can exist, be refreshed, or be missing on its
-- own.
--
-- Second, `is_mock` existed so a placeholder written when no API key was
-- configured could be told apart from a real analysis. It could not be told
-- apart by a reader: the stock page rendered it as prose like any other summary,
-- so /stock/ADYEN.AS served "Placeholder — ANTHROPIC_API_KEY is not set" as
-- though it were the analysis. The app no longer writes a placeholder at all —
-- without a key the block is hidden — so the column is dropped rather than kept
-- as a flag nobody may rely on. With no column to record it, a placeholder has
-- nowhere to be stored.

create table ticker_summaries_per_language (
  symbol           text not null,
  /** 'en' | 'nl' — the language it was generated in, never translated into. */
  lang             text not null check (lang in ('en', 'nl')),
  thesis           text not null check (length(btrim(thesis)) > 0),
  model            text,
  /** The signal state it was written against, so a stale thesis is visible. */
  signal_as_of     date,
  generated_by     uuid references auth.users (id),
  generated_at     timestamptz not null default now(),
  /** Tokens spent, so the cost of the feature is inspectable. */
  input_tokens     int,
  output_tokens    int,
  primary key (symbol, lang)
);

-- Carry across only real analyses. A mock row, or one carrying the placeholder
-- text under any flag, is dropped rather than migrated: it was never an
-- analysis, and the page had no way to say so.
insert into ticker_summaries_per_language
  (symbol, lang, thesis, model, signal_as_of, generated_by, generated_at, input_tokens, output_tokens)
select symbol, 'en', btrim(thesis_en), model, signal_as_of, generated_by, generated_at, input_tokens, output_tokens
  from ticker_summaries
 where is_mock is not true
   and thesis_en is not null
   and length(btrim(thesis_en)) > 0
   and btrim(thesis_en) not like 'Placeholder %'
   and btrim(thesis_en) not like 'Voorbeeldtekst %'
union all
select symbol, 'nl', btrim(thesis_nl), model, signal_as_of, generated_by, generated_at, input_tokens, output_tokens
  from ticker_summaries
 where is_mock is not true
   and thesis_nl is not null
   and length(btrim(thesis_nl)) > 0
   and btrim(thesis_nl) not like 'Placeholder %'
   and btrim(thesis_nl) not like 'Voorbeeldtekst %';

drop table ticker_summaries;
alter table ticker_summaries_per_language rename to ticker_summaries;

comment on table ticker_summaries is
  'On-demand AI thesis, one row per ticker per language. Never generated in the background, and never written for a failed or unconfigured generation.';

alter table ticker_summaries enable row level security;

-- Readable by the household. Writes go through a route handler running as the
-- signed-in user, so insert and update are granted too, scoped to the whitelist.
create policy ticker_summaries_read on ticker_summaries
  for select to authenticated
  using (public.is_allowed_user());

create policy ticker_summaries_write on ticker_summaries
  for insert to authenticated
  with check (public.is_allowed_user() and generated_by = (select auth.uid()));

create policy ticker_summaries_update on ticker_summaries
  for update to authenticated
  using (public.is_allowed_user())
  with check (public.is_allowed_user() and generated_by = (select auth.uid()));
