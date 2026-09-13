-- 0019_ticker_summaries.sql
--
-- Cached AI thesis summaries, one per ticker.
--
-- A dedicated table rather than columns on `watchlist_items`, because the stock
-- detail page renders for any symbol that has a signal — including suggestions
-- that nobody has accepted yet — and those have no watchlist row to hang a
-- summary on.
--
-- Keyed on symbol, not on user: the thesis describes the company, so both
-- household members read the same one. `generated_by` records who paid for it.

create table ticker_summaries (
  symbol           text primary key,
  thesis           text not null,
  /** 'en' | 'nl' — the language it was generated in. */
  lang             text not null default 'en' check (lang in ('en', 'nl')),
  model            text,
  /** True when no API key was configured and the text is the placeholder. */
  is_mock          boolean not null default false,
  /** The signal state it was written against, so a stale thesis is visible. */
  signal_as_of     date,
  generated_by     uuid references auth.users (id),
  generated_at     timestamptz not null default now(),
  /** Tokens spent, so the cost of the feature is inspectable. */
  input_tokens     int,
  output_tokens    int
);

comment on table ticker_summaries is
  'On-demand AI thesis per ticker. Never generated in the background — only when asked for.';

alter table ticker_summaries enable row level security;

-- Readable by the household. Writes go through a server action running as the
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
