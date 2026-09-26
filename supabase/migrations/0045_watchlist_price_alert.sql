-- Per-stock price-trigger opt-in (launch item 10).
--
-- When a stock's only missing condition is the 50% decline, the entry price it
-- would pass at is known (5-year high x 0.5). A member can ask to be emailed the
-- night the price crosses it. The flag lives on the shared watchlist row, like
-- the rest of this single-owner model; the nightly price pass reads it.
alter table watchlist_items
  add column if not exists price_alert boolean not null default false;
