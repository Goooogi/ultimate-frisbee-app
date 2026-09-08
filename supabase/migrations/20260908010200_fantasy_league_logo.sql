-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 3 of 9 — league logo.
--
-- A league can set EITHER a custom uploaded logo (logo_url, in the
-- league-logos bucket) OR a stock league icon (logo_icon, a "<league>:<name>"
-- token the client resolves to a bundled asset) — never both. Mirrors the
-- ufa-headshots / avatars storage patterns already in this repo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fantasy_leagues
  add column if not exists logo_url text,
  add column if not exists logo_icon text;

alter table public.fantasy_leagues
  add constraint fantasy_leagues_logo_icon_check
  check (logo_icon is null or logo_icon ~ '^(ufa|usau|pul|wul|wfdf|euf):[A-Za-z0-9][A-Za-z0-9/_-]{0,79}$');

alter table public.fantasy_leagues
  add constraint fantasy_leagues_logo_url_check
  check (logo_url is null or logo_url ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/league-logos/[0-9a-f-]{36}/');

alter table public.fantasy_leagues
  add constraint fantasy_leagues_logo_exclusive_check
  check (logo_url is null or logo_icon is null);

-- Column-level grant, matching 20260815015542's pattern (table-level SELECT
-- was already narrowed to a safe column list there — extend that list here).
grant select (logo_url, logo_icon) on public.fantasy_leagues to anon, authenticated;

-- ── league-logos bucket ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'league-logos', 'league-logos', true,
  2097152,  -- 2MB ceiling
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── fantasy_is_commissioner_of_folder — storage-policy owner test ────────────
-- Storage policies can't join fantasy_leagues directly against auth.uid() in
-- one clean expression once we need a regex-guarded cast, so this small
-- helper isolates it: first path segment must be a valid uuid before casting
-- (an invalid segment must FAIL CLOSED, not throw and break the policy).
create or replace function public.fantasy_is_commissioner_of_folder(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_seg text;
begin
  v_seg := (storage.foldername(p_name))[1];
  if v_seg is null or v_seg !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.fantasy_is_commissioner(v_seg::uuid);
end;
$$;

revoke all on function public.fantasy_is_commissioner_of_folder(text) from public, anon;
grant execute on function public.fantasy_is_commissioner_of_folder(text) to authenticated;

-- Public read; writes only by the league's commissioner, scoped to their own
-- league's folder (first path segment = league id) — mirrors avatars' owner-
-- folder convention (20260715224227).
drop policy if exists league_logos_select_public on storage.objects;
create policy league_logos_select_public
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'league-logos');

drop policy if exists league_logos_insert_commissioner on storage.objects;
create policy league_logos_insert_commissioner
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'league-logos' and public.fantasy_is_commissioner_of_folder(name));

drop policy if exists league_logos_update_commissioner on storage.objects;
create policy league_logos_update_commissioner
  on storage.objects for update
  to authenticated
  using (bucket_id = 'league-logos' and public.fantasy_is_commissioner_of_folder(name))
  with check (bucket_id = 'league-logos' and public.fantasy_is_commissioner_of_folder(name));

drop policy if exists league_logos_delete_commissioner on storage.objects;
create policy league_logos_delete_commissioner
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'league-logos' and public.fantasy_is_commissioner_of_folder(name));

-- ── fantasy_set_league_logo — commissioner-only RPC ───────────────────────────
create or replace function public.fantasy_set_league_logo(p_league uuid, p_url text, p_icon text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if not public.fantasy_is_commissioner(p_league) then
    raise exception 'not authorized — commissioner only';
  end if;

  if p_url is not null and p_icon is not null then
    raise exception 'set either a custom logo or a stock icon, not both';
  end if;

  if p_url is not null then
    if p_url !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/league-logos/[0-9a-f-]{36}/' then
      raise exception 'invalid logo url';
    end if;
    if position('/league-logos/' || p_league::text || '/' in p_url) = 0 then
      raise exception 'logo url must be under this league''s own folder';
    end if;
  end if;

  if p_icon is not null and p_icon !~ '^(ufa|usau|pul|wul|wfdf|euf):[A-Za-z0-9][A-Za-z0-9/_-]{0,79}$' then
    raise exception 'invalid logo icon';
  end if;

  update public.fantasy_leagues
  set logo_url = p_url, logo_icon = p_icon
  where id = p_league;
end;
$$;

revoke all on function public.fantasy_set_league_logo(uuid, text, text) from public, anon;
grant execute on function public.fantasy_set_league_logo(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
