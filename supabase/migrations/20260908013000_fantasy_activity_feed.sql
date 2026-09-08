-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy league activity feed + chat (Hunter, 2026-09-08 — depth backlog 2).
--
-- fantasy_league_activity: append-only system events, written ONLY by
-- triggers/service role (members joining, teams created, draft scheduled /
-- live / picks / complete, add-drops; the scorer inserts matchup_final).
-- Public read, like standings.
--
-- fantasy_league_messages: league chat. Members read + post (own user_id);
-- author or commissioner may delete. jersey_text_is_clean() is the DB-side
-- profanity backstop (client moderateName() stays the instant UX check).
-- Both tables are in the realtime publication so an open feed updates live.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.fantasy_league_activity (
  id            bigserial primary key,
  league_id     uuid not null references public.fantasy_leagues(id) on delete cascade,
  contest_id    uuid references public.fantasy_contests(id) on delete cascade,
  kind          text not null check (kind in (
    'member_joined','team_created','draft_scheduled','draft_live','draft_pick','draft_complete','add_drop','matchup_final'
  )),
  actor_user_id uuid references public.profiles(id) on delete set null,
  team_id       uuid references public.fantasy_teams(id) on delete set null,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index fantasy_league_activity_league_idx on public.fantasy_league_activity (league_id, created_at desc);
alter table public.fantasy_league_activity enable row level security;
create policy "fantasy_league_activity public read" on public.fantasy_league_activity for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.fantasy_league_activity;

create table public.fantasy_league_messages (
  id         bigserial primary key,
  league_id  uuid not null references public.fantasy_leagues(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index fantasy_league_messages_league_idx on public.fantasy_league_messages (league_id, created_at desc);
alter table public.fantasy_league_messages enable row level security;
create policy "fantasy_league_messages member read" on public.fantasy_league_messages
  for select to authenticated using (public.fantasy_is_league_member(league_id));
create policy "fantasy_league_messages member insert" on public.fantasy_league_messages
  for insert to authenticated with check (user_id = (select auth.uid()) and public.fantasy_is_league_member(league_id));
create policy "fantasy_league_messages author or commissioner delete" on public.fantasy_league_messages
  for delete to authenticated using (user_id = (select auth.uid()) or public.fantasy_is_commissioner(league_id));
grant select, insert, delete on public.fantasy_league_messages to authenticated;
alter publication supabase_realtime add table public.fantasy_league_messages;

create or replace function public.fantasy_league_messages_reject_profanity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.jersey_text_is_clean(new.body) then
    raise exception 'That message isn''t allowed. Please reword it.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger fantasy_league_messages_profanity
  before insert on public.fantasy_league_messages
  for each row execute function public.fantasy_league_messages_reject_profanity();

-- Rate limit: 30 messages per league per user per 10 minutes.
create or replace function public.fantasy_league_messages_rate_limit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  select count(*) into n from public.fantasy_league_messages
  where league_id = new.league_id and user_id = new.user_id and created_at > now() - interval '10 minutes';
  if n >= 30 then
    raise exception 'Slow down — try again in a few minutes.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.fantasy_league_messages_rate_limit() from anon, authenticated, public;
create trigger fantasy_league_messages_rate_limit
  before insert on public.fantasy_league_messages
  for each row execute function public.fantasy_league_messages_rate_limit();

-- ── Activity writers (security definer: the table has no client write policy) ─
create or replace function public.fantasy_activity_member_joined()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.fantasy_league_activity (league_id, kind, actor_user_id, payload)
  values (new.league_id, 'member_joined', new.user_id,
          jsonb_build_object('name', coalesce(new.member_display_name, new.member_username), 'role', new.role));
  return new;
end;
$$;
create trigger fantasy_activity_member_joined after insert on public.fantasy_league_members
  for each row execute function public.fantasy_activity_member_joined();

create or replace function public.fantasy_activity_team_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_league uuid;
begin
  if new.contest_id is null then return new; end if;
  select league_id into v_league from public.fantasy_contests where id = new.contest_id;
  if v_league is null then return new; end if;
  insert into public.fantasy_league_activity (league_id, contest_id, kind, actor_user_id, team_id, payload)
  values (v_league, new.contest_id, 'team_created', new.owner_id, new.id,
          jsonb_build_object('teamName', new.team_name, 'owner', coalesce(new.owner_display_name, new.owner_username)));
  return new;
end;
$$;
create trigger fantasy_activity_team_created after insert on public.fantasy_teams
  for each row execute function public.fantasy_activity_team_created();

create or replace function public.fantasy_activity_draft()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_league uuid; v_kind text;
begin
  select league_id into v_league from public.fantasy_contests where id = new.contest_id;
  if v_league is null then return new; end if;
  if tg_op = 'INSERT' then
    v_kind := 'draft_scheduled';
  elsif old.status is distinct from new.status and new.status = 'live' then
    v_kind := 'draft_live';
  elsif old.status is distinct from new.status and new.status = 'complete' then
    v_kind := 'draft_complete';
  else
    return new;
  end if;
  insert into public.fantasy_league_activity (league_id, contest_id, kind, actor_user_id, payload)
  values (v_league, new.contest_id, v_kind, new.created_by,
          jsonb_build_object('draftType', new.draft_type, 'scheduledAt', new.scheduled_at, 'rounds', new.rounds));
  return new;
end;
$$;
create trigger fantasy_activity_draft after insert or update of status on public.fantasy_drafts
  for each row execute function public.fantasy_activity_draft();

create or replace function public.fantasy_activity_draft_pick()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_league uuid; v_contest uuid; v_team_name text; v_owner uuid;
begin
  select d.contest_id, c.league_id into v_contest, v_league
  from public.fantasy_drafts d join public.fantasy_contests c on c.id = d.contest_id
  where d.id = new.draft_id;
  if v_league is null then return new; end if;
  select team_name, owner_id into v_team_name, v_owner from public.fantasy_teams where id = new.team_id;
  insert into public.fantasy_league_activity (league_id, contest_id, kind, actor_user_id, team_id, payload)
  values (v_league, v_contest, 'draft_pick', v_owner, new.team_id,
          jsonb_build_object('teamName', v_team_name, 'playerName', new.player_name, 'playerLeague', new.player_league,
                             'playerId', new.player_id, 'overall', new.overall, 'round', new.round, 'auto', new.auto, 'price', new.price));
  return new;
end;
$$;
create trigger fantasy_activity_draft_pick after insert on public.fantasy_draft_picks
  for each row execute function public.fantasy_activity_draft_pick();

create or replace function public.fantasy_activity_add_drop()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_league uuid; v_team_name text; v_owner uuid;
begin
  select league_id into v_league from public.fantasy_contests where id = new.contest_id;
  if v_league is null then return new; end if;
  select team_name, owner_id into v_team_name, v_owner from public.fantasy_teams where id = new.team_id;
  insert into public.fantasy_league_activity (league_id, contest_id, kind, actor_user_id, team_id, payload)
  values (v_league, new.contest_id, 'add_drop', v_owner, new.team_id,
          jsonb_build_object('teamName', v_team_name, 'added', new.added_name, 'dropped', new.dropped_name,
                             'addedLeague', new.added_league, 'addedId', new.added_id));
  return new;
end;
$$;
create trigger fantasy_activity_add_drop after insert on public.fantasy_transactions
  for each row execute function public.fantasy_activity_add_drop();

revoke execute on function public.fantasy_activity_member_joined() from anon, authenticated, public;
revoke execute on function public.fantasy_activity_team_created() from anon, authenticated, public;
revoke execute on function public.fantasy_activity_draft() from anon, authenticated, public;
revoke execute on function public.fantasy_activity_draft_pick() from anon, authenticated, public;
revoke execute on function public.fantasy_activity_add_drop() from anon, authenticated, public;
revoke execute on function public.fantasy_league_messages_reject_profanity() from anon, authenticated, public;

notify pgrst, 'reload schema';
