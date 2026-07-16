-- 1) Upload rate limit: a user can have at most 20 pending submissions in a
-- rolling 24h window. Prevents storage drain by a malicious authenticated
-- user. Admins are exempt (they shouldn't be queueing anyway, but it's
-- cleaner to skip the check than to have admins hit the limit during
-- testing).
create or replace function public.check_player_content_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_count integer;
begin
  -- Skip the check for admins.
  if public.is_admin() then
    return new;
  end if;
  select count(*) into pending_count
  from public.player_content
  where uploaded_by = new.uploaded_by
    and status = 'pending'
    and created_at > now() - interval '24 hours';
  if pending_count >= 20 then
    raise exception 'Upload limit reached: max 20 pending submissions per 24 hours. Wait for review.';
  end if;
  return new;
end;
$$;

create trigger player_content_rate_limit
before insert on public.player_content
for each row execute function public.check_player_content_rate_limit();

-- 2) Length constraint on rejection_reason to bound admin input.
alter table public.player_content
  add constraint player_content_rejection_reason_length
  check (rejection_reason is null or char_length(rejection_reason) <= 1000);

-- 3) Length constraint on caption to mirror client-side cap.
alter table public.player_content
  add constraint player_content_caption_length
  check (caption is null or char_length(caption) <= 500);
