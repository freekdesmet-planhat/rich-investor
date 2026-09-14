-- 0026_daily_digest_kind.sql
--
-- A notification kind for the daily digest.
--
-- `notification_kind` had 'buy_signal' (one mail per ticker, the moment it
-- crosses) and 'weekly_summary' (never built). The digest is neither: it is one
-- mail per recipient per day covering everything that moved, so it needs its
-- own kind to dedupe against.
--
-- The dedupe index is already `(user_id, kind, coalesce(symbol, ''), as_of)`,
-- and a digest carries no symbol — the coalesce is what makes a null symbol
-- deduplicate rather than slip past a unique constraint, so one digest per
-- person per day is enforced by the database and a re-run of the nightly job
-- cannot send a second one.

alter type notification_kind add value if not exists 'daily_digest';
