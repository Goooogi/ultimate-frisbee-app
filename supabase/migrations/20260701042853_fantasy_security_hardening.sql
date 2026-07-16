-- ─── Phase 3 security hardening (from security review 2026-06-30) ────────────

-- [HIGH] owner_username impersonation: it's an owner-writable column, and the
-- public leaderboard reads it. Force it server-side from profiles.username on
-- every insert/update so a client-supplied value can never stick. This is the
-- airtight fix; the Phase 4 app layer will ALSO set it, as defense in depth.
create or replace function public.fantasy_sync_owner_username()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  select username into new.owner_username
  from public.profiles
  where id = new.owner_id;
  return new;
end;
$$;

create trigger fantasy_teams_sync_username
  before insert or update on public.fantasy_teams
  for each row execute function public.fantasy_sync_owner_username();

-- Trigger fn — never an RPC. No API role needs EXECUTE.
revoke execute on function public.fantasy_sync_owner_username() from anon, authenticated, public;

-- [LOW] fantasy_owns_team is null-safe for anon but has no reason to be anon-
-- callable. Revoke to silence the advisor + shrink surface. (RLS still works —
-- policies are evaluated internally, not via the RPC grant.)
revoke execute on function public.fantasy_owns_team(uuid) from anon;

-- [LOW] owner_username length guard (defense in depth behind the trigger).
-- profiles.username is ^[a-z0-9_]{3,30}$ so 30 is the real ceiling; allow 50 slack.
alter table public.fantasy_teams
  add constraint fantasy_teams_owner_username_check
  check (owner_username is null or char_length(owner_username) between 1 and 50);

-- [LOW] week format guard. Our weeks are UFA's "week-N" (NOT the reviewer's
-- example ISO format) — validate against the real shape so a malformed week
-- can't slip into roster/score rows.
alter table public.fantasy_roster_slots
  add constraint fantasy_slots_week_format
  check (week ~ '^week-[0-9]+$');
alter table public.fantasy_scores
  add constraint fantasy_scores_week_format
  check (week ~ '^week-[0-9]+$');

-- [MEDIUM/migration-hygiene] The unique index on (owner_id, league_id,
-- season_year) MUST stay NULLS NOT DISTINCT so two beta-pool rows (league_id
-- NULL) for the same owner+season conflict. Do NOT replace it with a plain
-- UNIQUE constraint in any future migration — that silently drops this behavior.
comment on constraint fantasy_teams_owner_id_league_id_season_year_key
  on public.fantasy_teams is
  'NULLS NOT DISTINCT is required: enforces one beta-pool team (league_id NULL) per owner per season. Do not replace with plain UNIQUE.';