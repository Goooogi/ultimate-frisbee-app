-- Rate-limit report creation (mirrors jersey_messages_rate_limit idiom):
-- max 10 reports per user per hour; admins exempt.
create or replace function public.player_content_reports_rate_limit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare n int;
begin
  if public.is_admin() then return new; end if;
  select count(*) into n from public.player_content_reports
    where reporter_id = new.reporter_id and created_at > now() - interval '1 hour';
  if n >= 10 then
    raise exception 'Too many reports in the last hour. Try again shortly.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger player_content_reports_rate_limit
  before insert on public.player_content_reports
  for each row execute function public.player_content_reports_rate_limit();
