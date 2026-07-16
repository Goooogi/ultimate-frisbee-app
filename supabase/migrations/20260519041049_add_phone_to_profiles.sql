-- Optional phone number on profile rows. We store as E.164 (+15551234567).
-- Validation is enforced via a CHECK so bad formats can't be persisted, and
-- the column is unique (when set) so the same number can't be tied to two
-- accounts.
alter table public.profiles
  add column phone text;

alter table public.profiles
  add constraint profiles_phone_format
  check (phone is null or phone ~ '^\+[1-9]\d{1,14}$');

create unique index profiles_phone_unique_idx
  on public.profiles (phone)
  where phone is not null;

comment on column public.profiles.phone is 'Optional E.164-formatted phone number (e.g. +15551234567). Unique when set.';
