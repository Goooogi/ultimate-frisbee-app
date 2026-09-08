-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy trades with commissioner veto (Hunter, 2026-09-08 — depth backlog 3).
--
-- Weekly, DRAFTED leagues only (ownership lives in fantasy_team_players).
-- Flow: proposer offers a set of their players for a set of the receiver's
-- players → receiver accepts → the trade enters a 24 h REVIEW window
-- (status 'accepted', executes_at = now()+24h) during which the commissioner
-- may VETO or APPROVE (approve executes immediately) → the hourly scorer
-- calls fantasy_execute_due_trades() to execute anything past its window.
-- Execution swaps fantasy_team_players rows, clears the traded players'
-- FUTURE roster slots (locked weeks keep their frozen lineups), logs a
-- fantasy_transactions row per side, and writes a league activity row.
-- Roster sizes may change (2-for-1 allowed) but each side must end between
-- the starters count and `rounds`.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.fantasy_trades (
  id               uuid primary key default gen_random_uuid(),
  contest_id       uuid not null references public.fantasy_contests(id) on delete cascade,
  proposer_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  receiver_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  -- [{playerLeague, playerId, playerName}] the proposer GIVES / GETS
  give             jsonb not null,
  get              jsonb not null,
  note             text check (note is null or char_length(note) <= 280),
  status           text not null default 'proposed'
                   check (status in ('proposed','accepted','executed','rejected','cancelled','vetoed')),
  created_by       uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  responded_at     timestamptz,
  executes_at      timestamptz,
  executed_at      timestamptz,
  decided_by       uuid references public.profiles(id) on delete set null,
  check (proposer_team_id <> receiver_team_id),
  check (jsonb_typeof(give) = 'array' and jsonb_typeof(get) = 'array')
);
create index fantasy_trades_contest_idx on public.fantasy_trades (contest_id, created_at desc);
create index fantasy_trades_due_idx on public.fantasy_trades (executes_at) where status = 'accepted';
alter table public.fantasy_trades enable row level security;
create policy "fantasy_trades public read" on public.fantasy_trades for select to anon, authenticated using (true);
-- no client writes: RPCs only
alter publication supabase_realtime add table public.fantasy_trades;

alter table public.fantasy_transactions drop constraint fantasy_transactions_kind_check;
alter table public.fantasy_transactions add constraint fantasy_transactions_kind_check check (kind in ('add_drop','trade'));

alter table public.fantasy_league_activity drop constraint fantasy_league_activity_kind_check;
alter table public.fantasy_league_activity add constraint fantasy_league_activity_kind_check check (kind in (
  'member_joined','team_created','draft_scheduled','draft_live','draft_pick','draft_complete','add_drop','matchup_final',
  'trade_proposed','trade_accepted','trade_executed','trade_vetoed','trade_rejected'
));

-- ── Internal: validate a trade is still executable, then execute it ─────────
create or replace function public.fantasy_trade_execute_internal(p_trade uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t        public.fantasy_trades;
  v_contest  public.fantasy_contests;
  v_period   record;
  v_ref      jsonb;
  v_min      int;
  v_max      int;
  v_prop_n   int;
  v_recv_n   int;
  v_prop_name text; v_recv_name text;
begin
  select * into v_t from public.fantasy_trades where id = p_trade for update;
  if not found or v_t.status <> 'accepted' then
    return;
  end if;
  select * into v_contest from public.fantasy_contests where id = v_t.contest_id for update;

  -- Never execute inside a lock window (games in progress).
  select p.* into v_period from public.fantasy_contest_periods p
  where p.contest_id = v_t.contest_id and p.lock_at <= now()
  order by p.lock_at desc limit 1;
  if found and (v_period.unlock_at is null or now() < v_period.unlock_at) then
    return; -- retried by the next scorer tick
  end if;

  -- Both sides must still own what they're giving.
  for v_ref in select * from jsonb_array_elements(v_t.give) loop
    if not exists (select 1 from public.fantasy_team_players tp where tp.contest_id = v_t.contest_id and tp.team_id = v_t.proposer_team_id
                   and tp.player_league = v_ref->>'playerLeague' and tp.player_id = v_ref->>'playerId') then
      update public.fantasy_trades set status = 'cancelled', responded_at = now() where id = p_trade;
      return;
    end if;
  end loop;
  for v_ref in select * from jsonb_array_elements(v_t.get) loop
    if not exists (select 1 from public.fantasy_team_players tp where tp.contest_id = v_t.contest_id and tp.team_id = v_t.receiver_team_id
                   and tp.player_league = v_ref->>'playerLeague' and tp.player_id = v_ref->>'playerId') then
      update public.fantasy_trades set status = 'cancelled', responded_at = now() where id = p_trade;
      return;
    end if;
  end loop;

  -- Resulting roster sizes: starters <= size <= rounds.
  v_min := coalesce((v_contest.settings->>'offenders')::int, 4) + coalesce((v_contest.settings->>'defenders')::int, 3);
  select coalesce(d.rounds, 12) into v_max from public.fantasy_drafts d where d.contest_id = v_t.contest_id;
  select count(*) into v_prop_n from public.fantasy_team_players where contest_id = v_t.contest_id and team_id = v_t.proposer_team_id;
  select count(*) into v_recv_n from public.fantasy_team_players where contest_id = v_t.contest_id and team_id = v_t.receiver_team_id;
  v_prop_n := v_prop_n - jsonb_array_length(v_t.give) + jsonb_array_length(v_t.get);
  v_recv_n := v_recv_n - jsonb_array_length(v_t.get) + jsonb_array_length(v_t.give);
  if v_prop_n < v_min or v_prop_n > v_max or v_recv_n < v_min or v_recv_n > v_max then
    update public.fantasy_trades set status = 'cancelled', responded_at = now() where id = p_trade;
    return;
  end if;

  -- Clear FUTURE roster slots for every traded player, then move ownership.
  delete from public.fantasy_roster_slots s
  using public.fantasy_contest_periods p
  where s.team_id in (v_t.proposer_team_id, v_t.receiver_team_id)
    and p.contest_id = v_t.contest_id and p.period = s.week and p.lock_at > now()
    and exists (
      select 1 from jsonb_array_elements(v_t.give || v_t.get) r
      where r->>'playerLeague' = s.player_league and r->>'playerId' = s.player_id
    );

  update public.fantasy_team_players tp
  set team_id = v_t.receiver_team_id, acquired_via = 'add', acquired_at = now()
  where tp.contest_id = v_t.contest_id and tp.team_id = v_t.proposer_team_id
    and exists (select 1 from jsonb_array_elements(v_t.give) r where r->>'playerLeague' = tp.player_league and r->>'playerId' = tp.player_id);

  update public.fantasy_team_players tp
  set team_id = v_t.proposer_team_id, acquired_via = 'add', acquired_at = now()
  where tp.contest_id = v_t.contest_id and tp.team_id = v_t.receiver_team_id
    and exists (select 1 from jsonb_array_elements(v_t.get) r where r->>'playerLeague' = tp.player_league and r->>'playerId' = tp.player_id);

  select team_name into v_prop_name from public.fantasy_teams where id = v_t.proposer_team_id;
  select team_name into v_recv_name from public.fantasy_teams where id = v_t.receiver_team_id;

  insert into public.fantasy_transactions (contest_id, team_id, kind, dropped_league, dropped_id, dropped_name, added_league, added_id, added_name)
  values (v_t.contest_id, v_t.proposer_team_id, 'trade', 'trade', v_t.id::text, (select string_agg(r->>'playerName', ', ') from jsonb_array_elements(v_t.give) r),
          'trade', v_t.id::text, (select string_agg(r->>'playerName', ', ') from jsonb_array_elements(v_t.get) r)),
         (v_t.contest_id, v_t.receiver_team_id, 'trade', 'trade', v_t.id::text, (select string_agg(r->>'playerName', ', ') from jsonb_array_elements(v_t.get) r),
          'trade', v_t.id::text, (select string_agg(r->>'playerName', ', ') from jsonb_array_elements(v_t.give) r));

  update public.fantasy_trades set status = 'executed', executed_at = now() where id = p_trade;

  insert into public.fantasy_league_activity (league_id, contest_id, kind, actor_user_id, team_id, payload)
  values (v_contest.league_id, v_t.contest_id, 'trade_executed', v_t.created_by, v_t.proposer_team_id,
          jsonb_build_object('tradeId', v_t.id, 'proposer', v_prop_name, 'receiver', v_recv_name,
                             'give', (select coalesce(jsonb_agg(r->>'playerName'), '[]'::jsonb) from jsonb_array_elements(v_t.give) r),
                             'get',  (select coalesce(jsonb_agg(r->>'playerName'), '[]'::jsonb) from jsonb_array_elements(v_t.get) r)));
end;
$$;
revoke execute on function public.fantasy_trade_execute_internal(uuid) from anon, authenticated, public;

-- The add_drop activity trigger must ignore trade transactions (they get their own row).
create or replace function public.fantasy_activity_add_drop()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_league uuid; v_team_name text; v_owner uuid;
begin
  if new.kind <> 'add_drop' then return new; end if;
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

-- ── Propose ──────────────────────────────────────────────────────────────────
create or replace function public.fantasy_propose_trade(p_contest uuid, p_receiver_team uuid, p_give jsonb, p_get jsonb, p_note text default null)
returns public.fantasy_trades
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_contest public.fantasy_contests;
  v_my_team uuid;
  v_ref jsonb;
  v_t public.fantasy_trades;
  v_league uuid;
  v_prop_name text; v_recv_name text;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  select * into v_contest from public.fantasy_contests where id = p_contest;
  if not found or v_contest.league_id is null then raise exception 'this contest does not support trades'; end if;
  if coalesce(v_contest.settings->>'mode','weekly-stats') <> 'weekly-stats' or not coalesce((v_contest.settings->>'draft')::boolean,false) then
    raise exception 'trades are only available in drafted weekly leagues';
  end if;
  if not exists (select 1 from public.fantasy_drafts where contest_id = p_contest and status = 'complete') then
    raise exception 'the draft must be complete before trading';
  end if;
  select id into v_my_team from public.fantasy_teams where contest_id = p_contest and owner_id = v_caller;
  if v_my_team is null then raise exception 'you do not have a team in this league'; end if;
  if v_my_team = p_receiver_team then raise exception 'pick another team to trade with'; end if;
  if not exists (select 1 from public.fantasy_teams where id = p_receiver_team and contest_id = p_contest) then
    raise exception 'that team is not in this league';
  end if;
  if jsonb_typeof(p_give) <> 'array' or jsonb_typeof(p_get) <> 'array' then raise exception 'bad trade payload'; end if;
  if jsonb_array_length(p_give) = 0 or jsonb_array_length(p_get) = 0 then raise exception 'each side must include at least one player'; end if;
  if jsonb_array_length(p_give) > 4 or jsonb_array_length(p_get) > 4 then raise exception 'at most 4 players per side'; end if;
  if exists (select 1 from public.fantasy_trades where contest_id = p_contest and status in ('proposed','accepted')
             and ((proposer_team_id = v_my_team and receiver_team_id = p_receiver_team) or (proposer_team_id = p_receiver_team and receiver_team_id = v_my_team))) then
    raise exception 'there is already an open trade between these teams';
  end if;
  for v_ref in select * from jsonb_array_elements(p_give) loop
    if not exists (select 1 from public.fantasy_team_players where contest_id = p_contest and team_id = v_my_team
                   and player_league = v_ref->>'playerLeague' and player_id = v_ref->>'playerId') then
      raise exception 'you do not own %', coalesce(v_ref->>'playerName', v_ref->>'playerId');
    end if;
  end loop;
  for v_ref in select * from jsonb_array_elements(p_get) loop
    if not exists (select 1 from public.fantasy_team_players where contest_id = p_contest and team_id = p_receiver_team
                   and player_league = v_ref->>'playerLeague' and player_id = v_ref->>'playerId') then
      raise exception 'they do not own %', coalesce(v_ref->>'playerName', v_ref->>'playerId');
    end if;
  end loop;
  if p_note is not null and not public.jersey_text_is_clean(p_note) then
    raise exception 'that note isn''t allowed';
  end if;

  insert into public.fantasy_trades (contest_id, proposer_team_id, receiver_team_id, give, get, note, created_by)
  values (p_contest, v_my_team, p_receiver_team, p_give, p_get, nullif(trim(p_note), ''), v_caller)
  returning * into v_t;

  select team_name into v_prop_name from public.fantasy_teams where id = v_my_team;
  select team_name into v_recv_name from public.fantasy_teams where id = p_receiver_team;
  insert into public.fantasy_league_activity (league_id, contest_id, kind, actor_user_id, team_id, payload)
  values (v_contest.league_id, p_contest, 'trade_proposed', v_caller, v_my_team,
          jsonb_build_object('tradeId', v_t.id, 'proposer', v_prop_name, 'receiver', v_recv_name));
  return v_t;
end;
$$;
revoke all on function public.fantasy_propose_trade(uuid, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.fantasy_propose_trade(uuid, uuid, jsonb, jsonb, text) to authenticated;

-- ── Respond: 'accept' | 'reject' (receiver) · 'cancel' (proposer) · 'veto' | 'approve' (commissioner) ─
create or replace function public.fantasy_respond_trade(p_trade uuid, p_action text)
returns public.fantasy_trades
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_t public.fantasy_trades;
  v_league uuid;
  v_prop_owner uuid; v_recv_owner uuid;
  v_prop_name text; v_recv_name text;
  v_kind text;
begin
  if v_caller is null then raise exception 'not authenticated'; end if;
  select * into v_t from public.fantasy_trades where id = p_trade for update;
  if not found then raise exception 'unknown trade'; end if;
  select league_id into v_league from public.fantasy_contests where id = v_t.contest_id;
  select owner_id, team_name into v_prop_owner, v_prop_name from public.fantasy_teams where id = v_t.proposer_team_id;
  select owner_id, team_name into v_recv_owner, v_recv_name from public.fantasy_teams where id = v_t.receiver_team_id;

  if p_action = 'accept' then
    if v_caller <> v_recv_owner then raise exception 'only the receiving team can accept'; end if;
    if v_t.status <> 'proposed' then raise exception 'this trade is no longer open'; end if;
    update public.fantasy_trades set status = 'accepted', responded_at = now(), executes_at = now() + interval '24 hours', decided_by = v_caller
    where id = p_trade returning * into v_t;
    v_kind := 'trade_accepted';
  elsif p_action = 'reject' then
    if v_caller <> v_recv_owner then raise exception 'only the receiving team can reject'; end if;
    if v_t.status <> 'proposed' then raise exception 'this trade is no longer open'; end if;
    update public.fantasy_trades set status = 'rejected', responded_at = now(), decided_by = v_caller where id = p_trade returning * into v_t;
    v_kind := 'trade_rejected';
  elsif p_action = 'cancel' then
    if v_caller <> v_prop_owner then raise exception 'only the proposing team can cancel'; end if;
    if v_t.status not in ('proposed','accepted') then raise exception 'this trade is no longer open'; end if;
    update public.fantasy_trades set status = 'cancelled', responded_at = now(), decided_by = v_caller where id = p_trade returning * into v_t;
    return v_t;
  elsif p_action = 'veto' then
    if not public.fantasy_is_commissioner(v_league) then raise exception 'not authorized — commissioner only'; end if;
    if v_t.status not in ('proposed','accepted') then raise exception 'this trade is no longer open'; end if;
    update public.fantasy_trades set status = 'vetoed', responded_at = now(), decided_by = v_caller where id = p_trade returning * into v_t;
    v_kind := 'trade_vetoed';
  elsif p_action = 'approve' then
    if not public.fantasy_is_commissioner(v_league) then raise exception 'not authorized — commissioner only'; end if;
    if v_t.status <> 'accepted' then raise exception 'only an accepted trade can be approved early'; end if;
    perform public.fantasy_trade_execute_internal(p_trade);
    select * into v_t from public.fantasy_trades where id = p_trade;
    if v_t.status <> 'executed' then raise exception 'the trade could not be executed right now (locked week or roster changed)'; end if;
    return v_t;
  else
    raise exception 'unknown action %', p_action;
  end if;

  insert into public.fantasy_league_activity (league_id, contest_id, kind, actor_user_id, team_id, payload)
  values (v_league, v_t.contest_id, v_kind, v_caller, v_t.receiver_team_id,
          jsonb_build_object('tradeId', v_t.id, 'proposer', v_prop_name, 'receiver', v_recv_name));
  return v_t;
end;
$$;
revoke all on function public.fantasy_respond_trade(uuid, text) from public, anon;
grant execute on function public.fantasy_respond_trade(uuid, text) to authenticated;

-- ── Execute due trades (service role — called by score-fantasy every hour) ──
create or replace function public.fantasy_execute_due_trades()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare r record; n int := 0;
begin
  for r in select id from public.fantasy_trades where status = 'accepted' and executes_at <= now() order by executes_at loop
    perform public.fantasy_trade_execute_internal(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.fantasy_execute_due_trades() from public, anon, authenticated;
grant execute on function public.fantasy_execute_due_trades() to service_role;

notify pgrst, 'reload schema';
