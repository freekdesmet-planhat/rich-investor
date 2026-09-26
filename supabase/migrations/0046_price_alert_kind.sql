-- A notification kind for the per-stock price-trigger email (launch item 10).
--
-- Sent the night a subscribed stock's price crosses the 50% entry level — the
-- one condition it was missing. Deduplicated by the existing
-- (recipient, kind, symbol, as_of) index, like the buy-signal alert.
alter type notification_kind add value if not exists 'price_alert';
