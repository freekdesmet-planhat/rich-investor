-- 0035_onboarding.sql
--
-- Whether this member has seen the primer.
--
-- On the settings row rather than in a cookie or localStorage, because the
-- question it answers is "has this person been shown how the app works", not
-- "has this browser". A member who signs in on their phone after reading the
-- primer on a laptop has been onboarded; a cookie would disagree and show it
-- to them again, which is the kind of small insult that makes software feel
-- careless.
--
-- Nullable with no default, and null means not yet. That makes the existing
-- household members — who have been using this for weeks — indistinguishable
-- from brand new ones, so they will each see the primer once. That is the
-- right outcome: it is new, it is short, and dismissing it is one click.

alter table settings
  add column if not exists onboarded_at timestamptz;

comment on column settings.onboarded_at is
  'When this member finished or skipped the primer. Null means they have not seen it.';
