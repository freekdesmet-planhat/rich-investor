-- Waitlist sign-ups from the public landing page (launch item 11).
--
-- Written by a server action using the service-role client, so RLS denies all
-- ordinary access: the anon and authed roles never read or write this table
-- directly. Sign-up and billing are out of scope; this is only an email and when.
create table if not exists waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  locale     text,
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;
-- No policies: only the service-role key (which bypasses RLS) can touch it.
