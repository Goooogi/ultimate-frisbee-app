-- profiles.avatar_icon — a team-logo / country-flag profile icon, stored as a
-- compact "league:teamId" REFERENCE (e.g. 'ufa:empire', 'wfdf:USA') rather than
-- an image URL. The app resolves the reference to a logo path (UFA/USAU/WUL
-- static assets, PUL R2 URL) or a country flag emoji (WFDF) at render time.
--
-- Why a reference and not a URL: team logos come from three incompatible
-- sources (static /public paths, the PUL R2 CDN, and WFDF flag emoji — not an
-- image at all), none of which fit avatar_url's strict same-project storage-URL
-- validation. Keeping it a reference also means a logo asset swap doesn't
-- orphan a user's chosen icon.
--
-- avatar_url (uploaded photo) and avatar_icon (picked team logo) are mutually
-- exclusive at the app layer: setting one clears the other. Render precedence:
-- avatar_icon first, then avatar_url, then the initials monogram.

alter table public.profiles
  add column if not exists avatar_icon text;

comment on column public.profiles.avatar_icon is
  'Team-logo/flag profile icon as a "league:teamId" reference (e.g. ufa:empire, wfdf:USA). Mutually exclusive with avatar_url at the app layer. Resolved to a logo/flag at render time.';

-- Format guard: '<league>:<id>' where league is one of the five supported and
-- id is a short slug/code. Defense in depth on top of the app-layer validation
-- in setAvatarIcon(); keeps a raw REST write from stashing arbitrary text here
-- (which the nav chip would then try to resolve). Length-bounded to avoid abuse.
alter table public.profiles
  add constraint profiles_avatar_icon_format
  check (
    avatar_icon is null
    or avatar_icon ~ '^(ufa|usau|pul|wul|wfdf):[A-Za-z0-9][A-Za-z0-9/_-]{0,79}$'
  );
