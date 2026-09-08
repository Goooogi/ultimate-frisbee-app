-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy expansion, migration 4 of 9 — team-player ownership table.
--
-- fantasy_team_players is the durable "who owns this player" ledger for a
-- drafted contest — populated by draft picks and later by add/drop swaps
-- (migration 8). This REPLACES fantasy_draft_picks as the source the roster-
-- composition trigger checks for drafted-league exclusivity: draft picks are
-- an append-only draft-day log, but ownership needs to move on add/drop,
-- which fantasy_draft_picks must never do (it's the draft board of record).
-- ─────────────────────────────────────────────────────────────────────────────

-- fantasy_draft_picks.price is read by the seed function below (auction
-- winning bids); add it here so the backfill works whenever it runs. Migration
-- 7 repeats this with `if not exists`.
alter table public.fantasy_draft_picks
  add column if not exists price int check (price is null or price >= 0);

create table public.fantasy_team_players (
  contest_id    uuid not null references public.fantasy_contests(id) on delete cascade,
  team_id       uuid not null references public.fantasy_teams(id) on delete cascade,
  player_league text not null check (player_league in ('ufa','usau','pul','wul','wfdf','euf')),
  player_id     text not null,
  player_name   text not null,
  acquired_via  text not null check (acquired_via in ('draft','add')),
  price         int,
  acquired_at   timestamptz not null default now(),
  primary key (contest_id, player_league, player_id)
);

create index fantasy_team_players_team_idx on public.fantasy_team_players(team_id);

comment on table public.fantasy_team_players is 'Durable ownership ledger for drafted contests: which team currently owns which player. Seeded from fantasy_draft_picks on draft completion (fantasy_draft_seed_ownership); updated by fantasy_add_drop (migration 8). This — NOT fantasy_draft_picks — is what fantasy_enforce_roster_composition checks for drafted-league exclusivity, since ownership can move after draft day and the draft board itself must stay append-only.';

alter table public.fantasy_team_players enable row level security;

create policy "fantasy_team_players public read"
  on public.fantasy_team_players for select
  to anon, authenticated
  using (true);

-- No client write policies — service-role / SECURITY DEFINER fn only.

-- ── fantasy_draft_seed_ownership — internal, seeds ownership from picks ──────
create or replace function public.fantasy_draft_seed_ownership(p_draft uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest_id uuid;
begin
  select contest_id into v_contest_id from public.fantasy_drafts where id = p_draft;
  if v_contest_id is null then
    return;
  end if;

  insert into public.fantasy_team_players (contest_id, team_id, player_league, player_id, player_name, acquired_via, price, acquired_at)
  select v_contest_id, dp.team_id, dp.player_league, dp.player_id, dp.player_name, 'draft', dp.price, dp.created_at
  from public.fantasy_draft_picks dp
  where dp.draft_id = p_draft
  on conflict (contest_id, player_league, player_id) do nothing;
end;
$$;

revoke execute on function public.fantasy_draft_seed_ownership(uuid) from anon, authenticated, public;

comment on function public.fantasy_draft_seed_ownership is 'Seeds fantasy_team_players from a completed draft''s picks. Internal — called by fantasy_make_pick/fantasy_resolve_clock/fantasy_resolve_auction on draft completion (via fantasy_draft_on_complete, migration 6). on conflict do nothing keeps it idempotent.';

-- ── Backfill every already-complete draft, in this same transaction ──────────
do $$
declare
  r record;
  v_expected int;
  v_actual   int;
begin
  for r in select id from public.fantasy_drafts where status = 'complete' loop
    perform public.fantasy_draft_seed_ownership(r.id);
  end loop;

  select count(*) into v_expected from public.fantasy_draft_picks dp
  join public.fantasy_drafts d on d.id = dp.draft_id
  where d.status = 'complete';

  select count(*) into v_actual from public.fantasy_team_players where acquired_via = 'draft';

  if v_actual < v_expected then
    raise exception 'fantasy_team_players backfill incomplete: expected >= % draft-acquired rows, got %', v_expected, v_actual;
  end if;
end $$;

-- ── Repoint fantasy_enforce_roster_composition's exclusivity check ───────────
-- Guard: abort if the deployed body has diverged from committed 20260827010200.
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fantasy_enforce_roster_composition()'::regprocedure)
     <> '45dbee4ef74136d3cbc9767b5ebca8dd' then
    raise exception 'fantasy_enforce_roster_composition body has diverged from expected — aborting migration';
  end if;
end $$;

create or replace function public.fantasy_enforce_roster_composition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contest_id uuid;
  v_settings   jsonb;
  v_mode       text;
  v_max_off    int;
  v_max_def    int;
  v_max_flex   int;
  n_off        int;
  n_def        int;
  n_flex       int;
  v_drafted    boolean;
begin
  select contest_id into v_contest_id
  from public.fantasy_teams
  where id = NEW.team_id;

  if v_contest_id is null then
    -- Legacy fallback: hardcoded 4 offender / 3 defender, flex forbidden.
    if NEW.role = 'flex' then
      raise exception 'Roster cap: flex slots are not allowed for this team';
    end if;

    select
      count(*) filter (where role = 'offender'),
      count(*) filter (where role = 'defender')
    into n_off, n_def
    from public.fantasy_roster_slots
    where team_id = NEW.team_id and week = NEW.week
      and id <> NEW.id;

    if NEW.role = 'offender' then n_off := n_off + 1; else n_def := n_def + 1; end if;

    if n_off > 4 then
      raise exception 'Roster cap: max 4 offenders per week (team %, week %)', NEW.team_id, NEW.week;
    end if;
    if n_def > 3 then
      raise exception 'Roster cap: max 3 defenders per week (team %, week %)', NEW.team_id, NEW.week;
    end if;

    return NEW;
  end if;

  select settings into v_settings
  from public.fantasy_contests
  where id = v_contest_id;

  v_mode := coalesce(v_settings->>'mode', 'weekly-stats');

  select
    count(*) filter (where role = 'offender'),
    count(*) filter (where role = 'defender'),
    count(*) filter (where role = 'flex')
  into n_off, n_def, n_flex
  from public.fantasy_roster_slots
  where team_id = NEW.team_id and week = NEW.week
    and id <> NEW.id;

  if NEW.role = 'offender' then n_off := n_off + 1;
  elsif NEW.role = 'defender' then n_def := n_def + 1;
  else n_flex := n_flex + 1;
  end if;

  if v_mode = 'weekly-stats' then
    if NEW.role = 'flex' then
      raise exception 'Roster cap: flex slots are not allowed in weekly-stats mode (contest %)', v_contest_id;
    end if;
    v_max_off := coalesce((v_settings->>'offenders')::int, 4);
    v_max_def := coalesce((v_settings->>'defenders')::int, 3);
    if n_off > v_max_off then
      raise exception 'Roster cap: max % offenders per week (team %, week %)', v_max_off, NEW.team_id, NEW.week;
    end if;
    if n_def > v_max_def then
      raise exception 'Roster cap: max % defenders per week (team %, week %)', v_max_def, NEW.team_id, NEW.week;
    end if;
  elsif v_mode = 'event' then
    if NEW.role in ('offender','defender') then
      raise exception 'Roster cap: offender/defender roles are not allowed in event mode (contest %)', v_contest_id;
    end if;
    v_max_flex := coalesce((v_settings->>'flex')::int, 7);
    if n_flex > v_max_flex then
      raise exception 'Roster cap: max % flex slots per period (team %, period %)', v_max_flex, NEW.team_id, NEW.week;
    end if;
  else
    raise exception 'Unknown contest mode % for contest %', v_mode, v_contest_id;
  end if;

  -- Drafted-league exclusivity: settings."draft" = true means this contest
  -- ran a draft, and lineups may only use players THAT TEAM currently owns
  -- per fantasy_team_players (draft picks + subsequent add/drop swaps) — NOT
  -- fantasy_draft_picks, which stays a fixed draft-day log and never reflects
  -- post-draft roster moves. Public League / undrafted contests (flag absent
  -- or false) are unaffected.
  if coalesce((v_settings->>'draft')::boolean, false) then
    select exists (
      select 1
      from public.fantasy_team_players tp
      where tp.contest_id = v_contest_id
        and tp.team_id = NEW.team_id
        and tp.player_league = NEW.player_league
        and tp.player_id = NEW.player_id
    ) into v_drafted;

    if not v_drafted then
      raise exception 'This league is drafted — you can only roster players your team owns (contest %, player % %)',
        v_contest_id, NEW.player_league, NEW.player_id;
    end if;
  end if;

  return NEW;
end;
$$;

revoke execute on function public.fantasy_enforce_roster_composition() from anon, authenticated, public;

notify pgrst, 'reload schema';
