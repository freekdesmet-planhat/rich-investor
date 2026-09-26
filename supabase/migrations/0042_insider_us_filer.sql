-- 0042_insider_us_filer.sql
--
-- Whether the insider row is for a US filer, cached alongside it (A4).
--
-- Form 4 is a US filing. A non-US company (Adyen, Heineken) files none, but the
-- cache stored its empty answer indistinguishably from a US company that simply
-- had no recent insider trades — so the stock page showed "No reported insider
-- trades", a false all-clear. secInsider now returns usFiler, and the block is
-- hidden when it is false; the flag has to survive the cache to do that on a
-- cached read. Existing rows default to true (shown), and refresh within a day.

alter table insider_activity
  add column if not exists us_filer boolean not null default true;
