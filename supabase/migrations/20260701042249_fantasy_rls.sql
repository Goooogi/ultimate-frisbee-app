-- ─── RLS: public VIEW, owner-only WRITE (Hunter's auth boundary) ─────────────
alter table public.fantasy_leagues      enable row level security;
alter table public.fantasy_teams         enable row level security;
alter table public.fantasy_roster_slots  enable row level security;
alter table public.fantasy_scores         enable row level security;

-- Helper: does the current user own this fantasy team?
create or replace function public.fantasy_owns_team(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.fantasy_teams t
    where t.id = t_id and t.owner_id = (select auth.uid())
  );
$$;

-- ── fantasy_teams ──
-- PUBLIC read (anon + authenticated) so the leaderboard renders logged-out.
create policy "fantasy_teams public read"
  on public.fantasy_teams for select
  to anon, authenticated
  using (true);

create policy "fantasy_teams insert own"
  on public.fantasy_teams for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "fantasy_teams update own"
  on public.fantasy_teams for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "fantasy_teams delete own"
  on public.fantasy_teams for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ── fantasy_roster_slots ── (write gated via parent-team ownership)
create policy "fantasy_slots public read"
  on public.fantasy_roster_slots for select
  to anon, authenticated
  using (true);

create policy "fantasy_slots insert own team"
  on public.fantasy_roster_slots for insert
  to authenticated
  with check (public.fantasy_owns_team(team_id));

create policy "fantasy_slots update own team"
  on public.fantasy_roster_slots for update
  to authenticated
  using (public.fantasy_owns_team(team_id))
  with check (public.fantasy_owns_team(team_id));

create policy "fantasy_slots delete own team"
  on public.fantasy_roster_slots for delete
  to authenticated
  using (public.fantasy_owns_team(team_id));

-- ── fantasy_scores ── PUBLIC read; NO client write policy (scoring job uses
-- the service role, which bypasses RLS — same as the ufa_* ingest tables).
create policy "fantasy_scores public read"
  on public.fantasy_scores for select
  to anon, authenticated
  using (true);

-- ── fantasy_leagues ── (beta unused; owner-scoped for next year)
create policy "fantasy_leagues read own"
  on public.fantasy_leagues for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "fantasy_leagues insert own"
  on public.fantasy_leagues for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "fantasy_leagues update own"
  on public.fantasy_leagues for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "fantasy_leagues delete own"
  on public.fantasy_leagues for delete
  to authenticated
  using (owner_id = (select auth.uid()));