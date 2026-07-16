-- Self-hosted UFA player headshots. We stop hotlinking watchufa.com (multi-MB
-- originals, slow/flaky, can vanish) and instead store a small resized webp per
-- player here. Public bucket → served from Supabase's CDN with our own stable
-- URL; writes only via the service-role sync (no client uploads).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ufa-headshots', 'ufa-headshots', true,
  5242880,  -- 5MB ceiling (resized files are ~10–30KB; this is just a guard)
  array['image/webp','image/jpeg','image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read for the bucket; no INSERT/UPDATE/DELETE policies → only the
-- service-role key (which bypasses RLS) can write. Mirrors how the sync owns
-- this data end-to-end.
drop policy if exists ufa_headshots_public_read on storage.objects;
create policy ufa_headshots_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'ufa-headshots');