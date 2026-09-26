-- Per-user theme preference (round 2, item 3).
--
-- 'system' | 'light' | 'dark'. New users default to light (item 7 makes light the
-- primary theme). The render source is the rib-theme cookie, kept in sync when the
-- preference is saved; this column is the durable per-user record.
alter table settings
  add column if not exists theme text not null default 'light';
