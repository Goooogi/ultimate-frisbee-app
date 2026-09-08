-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 8 of 9 — add/drop (drafted weekly leagues only).
--
-- A same-transaction swap: drop one player your team owns, add one undrafted
-- player from the season pool, in one call. Only touches roster slots for
-- FUTURE periods (already-locked weeks keep their frozen lineup/score — the
-- roster-lock trigger would refuse those writes anyway, this is the same rule
-- applied explicitly so the error message is clear).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.fantasy_transactions (
  id             uuid primary key default gen_random_uuid(),
  contest_id     uuid not null references public.fantasy_contests(id) on delete cascade,
  team_id        uuid not null references public.fantasy_teams(id) on delete cascade,
  kind           text not null check (kind in ('add_drop')),
  dropped_league text not null,
  dropped_id     text not null,
  dropped_name   text not null,
  added_league   text not null,
  added_id       text not null,
  added_name     text not null,
  created_at     timestamptz not null default now()
);

create index fantasy_transactions_contest_idx on public.fantasy_transactions(contest_id);
create index fantasy_transactions_team_idx on public.fantasy_transactions(team_id);

comment on table public.fantasy_transactions is 'Append-only transaction log (add/drop swaps). Public read for league transparency; writes only via fantasy_add_drop.';

alter table public.fantasy_transactions enable row level security;

create policy "fantasy_transactions public read"
  on public.fantasy_transactions for select
  to anon, authenticated
  using (true);

-- No client write policies — service-role / SECURITY DEFINER fn only.

-- ── fantasy_add_drop ───────────────────────────────────────────────────────────
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

  -- Current period: the most recently locked one (max lock_at <= now()).
  -- While it's inside its own unlock window (games in progress), block the
  -- swap outright — mirrors the roster-lock trigger's own rule.
  select * into v_period
  from public.fantasy_contest_periods
  where contest_id = p_contest and lock_at <= now()
  order by lock_at desc
  limit 1;

  if found and (v_period.unlock_at is null or now() < v_period.unlock_at) then
    raise exception 'rosters are locked while this week''s games are in progress';
  end if;

  -- Drop must be a player this team currently owns.
  select player_name into v_dropped_name
  from public.fantasy_team_players
  where contest_id = p_contest and team_id = v_team_id
    and player_league = p_drop_league and player_id = p_drop_id;

  if v_dropped_name is null then
    raise exception 'your team does not own that player';
  end if;

  -- Add: league valid for this competition, not already owned in this
  -- contest (PK backstop), not a draft pick anywhere in this contest's
  -- draft, and actually exists in the season pool.
  if not public.fantasy_draft_player_league_valid(v_contest.competition, p_add_league) then
    raise exception 'player_league % is not valid for %', p_add_league, v_contest.competition;
  end if;

  if exists (
    select 1 from public.fantasy_team_players
    where contest_id = p_contest and player_league = p_add_league and player_id = p_add_id
  ) then
    raise exception 'that player is already owned in this league';
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

  -- Remove the drop's roster slots for periods that are still editable
  -- (lock_at > now()) only — already-locked weeks keep their frozen lineup.
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

notify pgrst, 'reload schema';
