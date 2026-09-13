-- 0016_seedable_watchlist.sql
--
-- Lets the watchlist hold rows nobody added by hand.
--
-- The seed list from section 3.2 exists before either member has signed in, and
-- the shared watchlist is household property rather than one person's, so
-- requiring an author on every row meant the app could not be populated until
-- after a first login. user_id stays for attribution where there is someone to
-- attribute.

alter table watchlist_items
  alter column user_id drop not null;

comment on column watchlist_items.user_id is
  'Who added the item; null for seeded rows. Not an access boundary — shared items are household-wide.';
