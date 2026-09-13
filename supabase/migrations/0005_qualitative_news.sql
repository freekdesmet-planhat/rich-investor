-- 0005_qualitative_news.sql
-- The user's own qualitative review (section 8) and the news layer (section 9).

-- ---------------------------------------------------------------------------
-- qualitative_reviews: the judgement the app explicitly cannot make.
-- One current review per (user, symbol); the notes carry their own dates.
-- ---------------------------------------------------------------------------
create table qualitative_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  symbol      text not null,

  assessment  problem_assessment not null default 'not_assessed',

  -- Catalyst checkboxes from the book, stored as keys so the label text lives
  -- in the translation layer: 'management_reaffirms_targets',
  -- 'management_buying_shares', 'buybacks', 'dividend_increase',
  -- 'sector_still_growing', 'founder_or_long_tenured_ceo',
  -- 'problem_confined_to_one_cycle'.
  catalysts   text[] not null default '{}',

  -- Sell signals from chapter 10: 'deteriorating_performance',
  -- 'large_acquisition_high_premium', 'involuntary_cfo_departure',
  -- 'declining_solvency', 'unusual_insider_selling',
  -- 'no_visible_future_growth'.
  sell_signals text[] not null default '{}',

  -- Answer to the standing Howard Marks question.
  marks_answer text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, symbol)
);

create trigger qualitative_reviews_set_updated_at
  before update on qualitative_reviews
  for each row execute function set_updated_at();

-- Free-text notes, each with its own date, kept as a running log.
create table qualitative_notes (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references qualitative_reviews (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  symbol     text not null,
  note       text not null,
  noted_on   date not null default current_date,
  created_at timestamptz not null default now()
);

create index qualitative_notes_review_idx on qualitative_notes (review_id, noted_on desc);

-- ---------------------------------------------------------------------------
-- news_items: the provider's news feed per stock (last 20 items).
-- ---------------------------------------------------------------------------
create table news_items (
  id           uuid primary key default gen_random_uuid(),
  symbol       text not null,
  title        text not null,
  url          text not null,
  source       text,
  published_at timestamptz,
  image_url    text,
  -- The provider ships a sentiment block; kept as-is, shown only as context.
  sentiment    jsonb,
  fetched_at   timestamptz not null default now(),
  unique (symbol, url)
);

create index news_items_symbol_idx on news_items (symbol, published_at desc);

-- ---------------------------------------------------------------------------
-- news_summaries: optional Anthropic web-search summary, gated behind
-- ANTHROPIC_API_KEY. Both languages are always written together (section 2).
-- ---------------------------------------------------------------------------
create table news_summaries (
  id           uuid primary key default gen_random_uuid(),
  symbol       text not null,
  as_of        date not null,
  summary_en   text not null,
  summary_nl   text not null,
  -- Flags raised by the summariser: 'results' | 'guidance' | 'management' | 'ma'.
  flags        text[] not null default '{}',
  model        text,
  -- Links the summary was built from, so a claim can be traced back.
  sources      jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  unique (symbol, as_of)
);

-- ---------------------------------------------------------------------------
-- earnings_calendar: last annual results and next expected earnings date.
-- ---------------------------------------------------------------------------
create table earnings_calendar (
  symbol             text primary key,
  last_annual_report date,
  next_earnings_date date,
  updated_at         timestamptz not null default now()
);

create trigger earnings_calendar_set_updated_at
  before update on earnings_calendar
  for each row execute function set_updated_at();
