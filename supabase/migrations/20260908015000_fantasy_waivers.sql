-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy waivers + FAAB (Hunter, 2026-09-08 — depth backlog 4).
--
-- Commissioner setting `settings.waivers` ∈ 'none' (default; first-come
-- add/drop as today) | 'faab'. In FAAB mode:
--   • every team has a season budget `settings.faabBudget` (default 100);
--   • a player who is dropped (add/drop, trade fallout is not a drop) or was
--     never drafted is claimable via a sealed bid: fantasy_waiver_claims
--     (team, add ref, optional drop ref, bid ≤ remaining budget);
--   • dropped players carry a waiver window: settings.waiverHours (default 48)
--     from fantasy_waiver_players.available_at; undrafted free agents are
--     always claimable (their "window" is the next processing tick);
--   • processing (fantasy_process_waivers, service role, called by the hourly
--     scorer) resolves each contest's due claims: per player, highest bid
--     wins (tie → worse H2H record, then earlier claim), budget debited, the
--     winner's optional drop executed, losing claims for that player marked
--     'lost'; claims whose drop player was already moved are 'voided'.
--   • direct fantasy_add_drop is refused for waiver-listed players while their
--     window is open (free agents past their window remain first-come).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.fantasy_waiver_players (
  contest_id    uuid not null references public.fantasy_contests(id) on delete cascade,
  player_league text not null,
  player_id     text not null,
  player_name   text not null,
  available_at  timestamptz not null,          -- when claims resolve (drop time + waiverHours)
  created_at    timestamptz not null default now(),
  primary key (contest_id, player_league, player_id)
);
alter table public.fantasy_waiver_players enable row level security;
create policy "fantasy_waiver_players public read" on public.fantasy_waiver_players for select to anon, authenticated using (true);

create table public.fantasy_waiver_claims (
  id            uuid primary key default gen_random_uuid(),
  contest_id    uuid not null references public.fantasy_contests(id) on delete cascade,
  team_id       uuid not null references public.fantasy_teams(id) on delete cascade,
  add_league    text not null,
  add_id        text not null,
  add_name      text not null,
  drop_league   text,
  drop_id       text,
  drop_name     text,
  bid           int not null check (bid >= 0),
  status        text not null default 'pending' check (status in ('pending','won','lost','voided','cancelled')),
  process_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (contest_id, team_id, add_league, add_id)
);
create index fantasy_waiver_claims_due_idx on public.fantasy_waiver_claims (process_at) where status = 'pending';
alter table public.fantasy_waiver_claims enable row level security;
create policy "fantasy_waiver_claims own read" on public.fantasy_waiver_claims for select to authenticated
  using (public.fantasy_owns_team(team_id) or status <> 'pending');
alter publication supabase_realtime add table public.fantasy_waiver_claims;

alter table public.fantasy_transactions drop constraint fantasy_transactions_kind_check;
alter table public.fantasy_transactions add constraint fantasy_transactions_kind_check check (kind in ('add_drop','trade','waiver'));

alter table public.fantasy_league_activity drop constraint fantasy_league_activity_kind_check;
alter table public.fantasy_league_activity add constraint fantasy_league_activity_kind_check check (kind in (
  'member_joined','team_created','draft_scheduled','draft_live','draft_pick','draft_complete','add_drop','matchup_final',
  'trade_proposed','trade_accepted','trade_executed','trade_vetoed','trade_rejected','waiver_claimed'
));

-- ── Commissioner settings ────────────────────────────────────────────────────
create or replace function public.fantasy_set_waiver_settings(p_contest uuid, p_mode text, p_budget int default 100, p_hours int default 48)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_league uuid;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  select league_id into v_league from public.fantasy_contests where id = p_contest for update;
  if v_league is null then raise exception 'this contest is not editable'; end if;
  if not public.fantasy_is_commissioner(v_league) then raise exception 'not authorized — commissioner only'; end if;
  if p_mode not in ('none','faab') then raise exception 'waiver mode must be none or faab'; end if;
  if p_budget < 1 or p_budget > 1000 then raise exception 'FAAB budget must be between 1 and 1000'; end if;
  if p_hours < 1 or p_hours > 168 then raise exception 'waiver window must be 1–168 hours'; end if;
  update public.fantasy_contests
  set settings = settings || jsonb_build_object('waivers', p_mode, 'faabBudget', p_budget, 'waiverHours', p_hours)
  where id = p_contest;
end;
$$;
revoke all on function public.fantasy_set_waiver_settings(uuid, text, int, int) from public, anon;
grant execute on function public.fantasy_set_waiver_settings(uuid, text, int, int) to authenticated;

-- ── FAAB spent so far (won claims) ───────────────────────────────────────────
create or replace function public.fantasy_faab_spent(p_contest uuid, p_team uuid)
returns int language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(bid), 0)::int from public.fantasy_waiver_claims where contest_id = p_contest and team_id = p_team and status = 'won';
$$;
revoke all on function public.fantasy_faab_spent(uuid, uuid) from public, anon;
grant execute on function public.fantasy_faab_spent(uuid, uuid) to authenticated;

-- ── Dropped players enter waivers (FAAB leagues only) ────────────────────────
create or replace function public.fantasy_waiver_on_drop()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_settings jsonb; v_hours int;
begin
  if new.kind <> 'add_drop' then return new; end if;
  select settings into v_settings from public.fantasy_contests where id = new.contest_id;
  if coalesce(v_settings->>'waivers', 'none') <> 'faab' then return new; end if;
  v_hours := coalesce((v_settings->>'waiverHours')::int, 48);
  insert into public.fantasy_waiver_players (contest_id, player_league, player_id, player_name, available_at)
  values (new.contest_id, new.dropped_league, new.dropped_id, new.dropped_name, now() + make_interval(hours => v_hours))
  on conflict (contest_id, player_league, player_id) do update set available_at = excluded.available_at, player_name = excluded.player_name;
  return new;
end;
$$;
revoke execute on function public.fantasy_waiver_on_drop() from anon, authenticated, public;
create trigger fantasy_waiver_on_drop after insert on public.fantasy_transactions
  for each row execute function public.fantasy_waiver_on_drop();

-- ── Claim ────────────────────────────────────────────────────────────────────
create or replace function public.fantasy_claim_waiver(
  p_contest uuid, p_add_league text, p_add_id text, p_add_name text, p_bid int,
  p_drop_league text default null, p_drop_id text default null
)
returns public.fantasy_waiver_claims
language plpgsql security definer set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_contest public.fantasy_contests;
  v_team uuid; v_budget int; v_spent int; v_process_at timestamptz; v_claim public.fantasy_waiver_claims; v_drop_name text;
  v_pool_ok boolean := false;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  select * into v_contest from public.fantasy_contests where id = p_contest;
  if not found or v_contest.league_id is null then raise exception 'this contest does not support waivers'; end if;
  if coalesce(v_contest.settings->>'waivers','none') <> 'faab' then raise exception 'this league uses first-come add/drop — use Add instead'; end if;
  if coalesce(v_contest.settings->>'mode','weekly-stats') <> 'weekly-stats' or not coalesce((v_contest.settings->>'draft')::boolean,false) then
    raise exception 'waivers are only available in drafted weekly leagues';
  end if;
  select id into v_team from public.fantasy_teams where contest_id = p_contest and owner_id = v_caller;
  if v_team is null then raise exception 'you do not have a team in this league'; end if;
  if not public.fantasy_draft_player_league_valid(v_contest.competition, p_add_league) then raise exception 'invalid player league'; end if;
  if exists (select 1 from public.fantasy_team_players where contest_id = p_contest and player_league = p_add_league and player_id = p_add_id) then
    raise exception 'that player is already owned';
  end if;
  if p_add_league = 'ufa' then v_pool_ok := exists (select 1 from public.ufa_players where id = p_add_id);
  elsif p_add_league = 'pul' then v_pool_ok := exists (select 1 from public.pul_players where player_name = p_add_id and season = v_contest.season_year);
  elsif p_add_league = 'wul' then v_pool_ok := exists (select 1 from public.wul_players where player_name = p_add_id and season = v_contest.season_year);
  end if;
  if not v_pool_ok then raise exception 'player not found in the season pool'; end if;

  v_budget := coalesce((v_contest.settings->>'faabBudget')::int, 100);
  v_spent := public.fantasy_faab_spent(p_contest, v_team);
  if p_bid < 0 or p_bid > v_budget - v_spent then
    raise exception 'bid must be between $0 and your remaining $%', v_budget - v_spent;
  end if;

  if p_drop_id is not null then
    select player_name into v_drop_name from public.fantasy_team_players
    where contest_id = p_contest and team_id = v_team and player_league = p_drop_league and player_id = p_drop_id;
    if v_drop_name is null then raise exception 'you do not own the player you want to drop'; end if;
  else
    -- No drop: the roster must have room (rounds cap).
    if (select count(*) from public.fantasy_team_players where contest_id = p_contest and team_id = v_team)
       >= (select coalesce(rounds, 12) from public.fantasy_drafts where contest_id = p_contest) then
      raise exception 'your roster is full — pick a player to drop';
    end if;
  end if;

  -- Waiver-listed → resolves at the player's available_at; free agent → next tick.
  select available_at into v_process_at from public.fantasy_waiver_players where contest_id = p_contest and player_league = p_add_league and player_id = p_add_id;
  if v_process_at is null or v_process_at < now() then v_process_at := now(); end if;

  insert into public.fantasy_waiver_claims (contest_id, team_id, add_league, add_id, add_name, drop_league, drop_id, drop_name, bid, process_at)
  values (p_contest, v_team, p_add_league, p_add_id, p_add_name, p_drop_league, p_drop_id, v_drop_name, p_bid, v_process_at)
  on conflict (contest_id, team_id, add_league, add_id) do update
    set bid = excluded.bid, drop_league = excluded.drop_league, drop_id = excluded.drop_id, drop_name = excluded.drop_name,
        status = 'pending', process_at = excluded.process_at, created_at = now(), resolved_at = null
  returning * into v_claim;
  return v_claim;
end;
$$;
revoke all on function public.fantasy_claim_waiver(uuid, text, text, text, int, text, text) from public, anon;
grant execute on function public.fantasy_claim_waiver(uuid, text, text, text, int, text, text) to authenticated;

create or replace function public.fantasy_cancel_waiver_claim(p_claim uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_team uuid;
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  select team_id into v_team from public.fantasy_waiver_claims where id = p_claim and status = 'pending';
  if v_team is null or not public.fantasy_owns_team(v_team) then raise exception 'claim not found'; end if;
  update public.fantasy_waiver_claims set status = 'cancelled', resolved_at = now() where id = p_claim;
end;
$$;
revoke all on function public.fantasy_cancel_waiver_claim(uuid) from public, anon;
grant execute on function public.fantasy_cancel_waiver_claim(uuid) to authenticated;

-- ── Direct add/drop refuses waiver-listed players in FAAB leagues ────────────
-- fantasy_add_drop (ours, 20260908010700) gets one extra guard; the body is
-- otherwise unchanged. Free agents past their window stay first-come.
create or replace function public.fantasy_add_drop(
  p_contest uuid,
  p_drop_league text,
  p_drop_id text,
  p_add_league text,
  p_add_id text,
  p_add_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller       uuid := (select auth.uid());
  v_contest      public.fantasy_contests;
  v_team_id      uuid;
  v_period       record;
  v_dropped_name text;
  v_pool_ok      boolean;
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  select * into v_contest from public.fantasy_contests where id = p_contest for update;
  if not found then
    raise exception 'unknown contest %', p_contest;
  end if;

  if v_contest.league_id is null then
    raise exception 'this contest is not editable';
  end if;

  if coalesce(v_contest.settings ->> 'mode', 'weekly-stats') <> 'weekly-stats' then
    raise exception 'add/drop is only available for weekly-stats contests';
  end if;

  if not coalesce((v_contest.settings ->> 'draft')::boolean, false) then
    raise exception 'this league is not drafted — add/drop does not apply';
  end if;

  if not exists (select 1 from public.fantasy_drafts where contest_id = p_contest and status = 'complete') then
    raise exception 'the draft must be complete before add/drop is available';
  end if;

  select id into v_team_id from public.fantasy_teams
  where contest_id = p_contest and owner_id = v_caller;
  if v_team_id is null then
    raise exception 'you do not have a team in this contest';
  end if;

  select * into v_period
  from public.fantasy_contest_periods
  where contest_id = p_contest and lock_at <= now()
  order by lock_at desc
  limit 1;

  if found and (v_period.unlock_at is null or now() < v_period.unlock_at) then
    raise exception 'rosters are locked while this week''s games are in progress';
  end if;

  select player_name into v_dropped_name
  from public.fantasy_team_players
  where contest_id = p_contest and team_id = v_team_id
    and player_league = p_drop_league and player_id = p_drop_id;

  if v_dropped_name is null then
    raise exception 'your team does not own that player';
  end if;

  if not public.fantasy_draft_player_league_valid(v_contest.competition, p_add_league) then
    raise exception 'player_league % is not valid for %', p_add_league, v_contest.competition;
  end if;

  if exists (
    select 1 from public.fantasy_team_players
    where contest_id = p_contest and player_league = p_add_league and player_id = p_add_id
  ) then
    raise exception 'that player is already owned in this league';
  end if;

  -- FAAB leagues: a player inside their waiver window needs a claim.
  if coalesce(v_contest.settings->>'waivers','none') = 'faab' and exists (
    select 1 from public.fantasy_waiver_players
    where contest_id = p_contest and player_league = p_add_league and player_id = p_add_id and available_at > now()
  ) then
    raise exception 'that player is on waivers — place a claim instead';
  end if;

  v_pool_ok := false;
  if p_add_league = 'ufa' then
    v_pool_ok := exists (select 1 from public.ufa_players where id = p_add_id);
  elsif p_add_league = 'pul' then
    v_pool_ok := exists (select 1 from public.pul_players where player_name = p_add_id and season = v_contest.season_year);
  elsif p_add_league = 'wul' then
    v_pool_ok := exists (select 1 from public.wul_players where player_name = p_add_id and season = v_contest.season_year);
  end if;

  if not v_pool_ok then
    raise exception 'player % not found in the % % pool', p_add_id, v_contest.competition, v_contest.season_year;
  end if;

  delete from public.fantasy_roster_slots s
  using public.fantasy_contest_periods p
  where s.team_id = v_team_id
    and s.player_league = p_drop_league
    and s.player_id = p_drop_id
    and p.contest_id = p_contest
    and p.period = s.week
    and p.lock_at > now();

  delete from public.fantasy_team_players
  where contest_id = p_contest and team_id = v_team_id
    and player_league = p_drop_league and player_id = p_drop_id;

  insert into public.fantasy_team_players (contest_id, team_id, player_league, player_id, player_name, acquired_via)
  values (p_contest, v_team_id, p_add_league, p_add_id, p_add_name, 'add');

  insert into public.fantasy_transactions (
    contest_id, team_id, kind, dropped_league, dropped_id, dropped_name, added_league, added_id, added_name
  )
  values (p_contest, v_team_id, 'add_drop', p_drop_league, p_drop_id, v_dropped_name, p_add_league, p_add_id, p_add_name);
end;
$$;
revoke all on function public.fantasy_add_drop(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.fantasy_add_drop(uuid, text, text, text, text, text) to authenticated;

-- ── Process due claims (service role — hourly from score-fantasy) ────────────
create or replace function public.fantasy_process_waivers()
returns int language plpgsql security definer set search_path = ''
as $$
declare
  r record; c record; v_contest public.fantasy_contests; v_budget int; v_spent int; v_won int := 0; v_team_name text; v_league uuid;
  v_period record;
begin
  for r in
    select distinct contest_id, add_league, add_id from public.fantasy_waiver_claims where status = 'pending' and process_at <= now()
  loop
    select * into v_contest from public.fantasy_contests where id = r.contest_id for update;
    -- inside a lock window → wait for the next tick
    select p.* into v_period from public.fantasy_contest_periods p where p.contest_id = r.contest_id and p.lock_at <= now() order by p.lock_at desc limit 1;
    if found and (v_period.unlock_at is null or now() < v_period.unlock_at) then continue; end if;
    v_budget := coalesce((v_contest.settings->>'faabBudget')::int, 100);
    v_league := v_contest.league_id;

    -- already owned (e.g. via trade) → void every claim on it
    if exists (select 1 from public.fantasy_team_players where contest_id = r.contest_id and player_league = r.add_league and player_id = r.add_id) then
      update public.fantasy_waiver_claims set status = 'voided', resolved_at = now()
      where contest_id = r.contest_id and add_league = r.add_league and add_id = r.add_id and status = 'pending';
      continue;
    end if;

    for c in
      select cl.*, coalesce(s.wins, 0) as wins, coalesce(s.points_for, 0) as pf
      from public.fantasy_waiver_claims cl
      left join public.fantasy_h2h_standings(r.contest_id) s on s.team_id = cl.team_id
      where cl.contest_id = r.contest_id and cl.add_league = r.add_league and cl.add_id = r.add_id and cl.status = 'pending'
      order by cl.bid desc, s.wins asc nulls first, s.points_for asc nulls first, cl.created_at asc
    loop
      v_spent := public.fantasy_faab_spent(r.contest_id, c.team_id);
      if c.bid > v_budget - v_spent then
        update public.fantasy_waiver_claims set status = 'voided', resolved_at = now() where id = c.id; continue;
      end if;
      if c.drop_id is not null and not exists (
        select 1 from public.fantasy_team_players where contest_id = r.contest_id and team_id = c.team_id and player_league = c.drop_league and player_id = c.drop_id
      ) then
        update public.fantasy_waiver_claims set status = 'voided', resolved_at = now() where id = c.id; continue;
      end if;
      if c.drop_id is null and (select count(*) from public.fantasy_team_players where contest_id = r.contest_id and team_id = c.team_id)
         >= (select coalesce(rounds, 12) from public.fantasy_drafts where contest_id = r.contest_id) then
        update public.fantasy_waiver_claims set status = 'voided', resolved_at = now() where id = c.id; continue;
      end if;

      -- winner
      if c.drop_id is not null then
        delete from public.fantasy_roster_slots s using public.fantasy_contest_periods p
        where s.team_id = c.team_id and s.player_league = c.drop_league and s.player_id = c.drop_id
          and p.contest_id = r.contest_id and p.period = s.week and p.lock_at > now();
        delete from public.fantasy_team_players where contest_id = r.contest_id and team_id = c.team_id and player_league = c.drop_league and player_id = c.drop_id;
        insert into public.fantasy_waiver_players (contest_id, player_league, player_id, player_name, available_at)
        values (r.contest_id, c.drop_league, c.drop_id, c.drop_name, now() + make_interval(hours => coalesce((v_contest.settings->>'waiverHours')::int, 48)))
        on conflict (contest_id, player_league, player_id) do update set available_at = excluded.available_at;
      end if;
      insert into public.fantasy_team_players (contest_id, team_id, player_league, player_id, player_name, acquired_via)
      values (r.contest_id, c.team_id, c.add_league, c.add_id, c.add_name, 'add');
      delete from public.fantasy_waiver_players where contest_id = r.contest_id and player_league = c.add_league and player_id = c.add_id;
      update public.fantasy_waiver_claims set status = 'won', resolved_at = now() where id = c.id;
      update public.fantasy_waiver_claims set status = 'lost', resolved_at = now()
      where contest_id = r.contest_id and add_league = r.add_league and add_id = r.add_id and status = 'pending' and id <> c.id;

      select team_name into v_team_name from public.fantasy_teams where id = c.team_id;
      insert into public.fantasy_transactions (contest_id, team_id, kind, dropped_league, dropped_id, dropped_name, added_league, added_id, added_name)
      values (r.contest_id, c.team_id, 'waiver', coalesce(c.drop_league, 'none'), coalesce(c.drop_id, 'none'), coalesce(c.drop_name, '—'), c.add_league, c.add_id, c.add_name);
      insert into public.fantasy_league_activity (league_id, contest_id, kind, team_id, payload)
      values (v_league, r.contest_id, 'waiver_claimed', c.team_id,
              jsonb_build_object('teamName', v_team_name, 'added', c.add_name, 'dropped', c.drop_name, 'bid', c.bid));
      v_won := v_won + 1;
      exit;
    end loop;
  end loop;
  return v_won;
end;
$$;
revoke all on function public.fantasy_process_waivers() from public, anon, authenticated;
grant execute on function public.fantasy_process_waivers() to service_role;

notify pgrst, 'reload schema';
