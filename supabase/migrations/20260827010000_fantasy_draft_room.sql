-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy V2 — Draft room backend (Fantasy V2 — Game Hub & Draft.md §5).
--
-- Schema: fantasy_drafts, fantasy_draft_picks, fantasy_draft_queues.
-- RPCs (SECURITY DEFINER, search_path='', REVOKE FROM PUBLIC then GRANT to
-- authenticated, notify pgrst at the end — 20260815 house style):
--   fantasy_schedule_draft, fantasy_start_draft, fantasy_make_pick,
--   fantasy_resolve_clock, fantasy_set_queue.
--
-- Client contract: src/lib/fantasy/draft-room.ts (frozen — this migration
-- implements exactly those RPC names/args/shapes). teamOnClock() snake math
-- is mirrored verbatim in fantasy_draft_team_on_clock() below.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── fantasy_drafts ──────────────────────────────────────────────────────────
create table public.fantasy_drafts (
  id                  uuid primary key default gen_random_uuid(),
  contest_id          uuid not null references public.fantasy_contests(id) on delete cascade,
  status              text not null default 'scheduled' check (status in ('scheduled','live','complete')),
  draft_type          text not null default 'snake' check (draft_type = 'snake'),
  rounds              int not null default 12 check (rounds between 1 and 40),
  pick_seconds        int not null default 60 check (pick_seconds between 10 and 600),
  draft_order         jsonb not null default '[]'::jsonb,  -- team ids, round-1 order
  current_overall     int not null default 1 check (current_overall >= 1),
  current_started_at  timestamptz,
  scheduled_at        timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (contest_id)
);

create index fantasy_drafts_contest_idx on public.fantasy_drafts(contest_id);

comment on table public.fantasy_drafts is 'One draft per contest (unique). draft_order is commissioner-shuffled at schedule time, re-shuffled (final) at start. current_overall is 1-based; teamOnClock() snake math (mirrored in fantasy_draft_team_on_clock()) resolves it against draft_order.';

alter table public.fantasy_drafts enable row level security;

create policy "fantasy_drafts public read"
  on public.fantasy_drafts for select
  to anon, authenticated
  using (true);

-- No client write policies — RPC-only (fantasy_schedule_draft/fantasy_start_draft/
-- fantasy_make_pick/fantasy_resolve_clock all SECURITY DEFINER).

-- ── fantasy_draft_picks ─────────────────────────────────────────────────────
create table public.fantasy_draft_picks (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null references public.fantasy_drafts(id) on delete cascade,
  overall       int not null check (overall >= 1),
  round         int not null check (round >= 1),
  team_id       uuid not null references public.fantasy_teams(id) on delete cascade,
  player_league text not null check (player_league in ('ufa','usau','pul','wul','wfdf')),
  player_id     text not null,
  player_name   text not null,
  auto          boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (draft_id, overall),
  -- DB-level exclusivity: a player can only be drafted once per draft (the
  -- ownership guarantee lineups rely on — see the roster-composition trigger
  -- extension below).
  unique (draft_id, player_league, player_id)
);

create index fantasy_draft_picks_draft_idx on public.fantasy_draft_picks(draft_id);
create index fantasy_draft_picks_team_idx on public.fantasy_draft_picks(team_id);

comment on table public.fantasy_draft_picks is 'Append-only draft board. UNIQUE(draft_id, overall) enforces one pick per slot; UNIQUE(draft_id, player_league, player_id) enforces one owner per player within a draft — the DB-level exclusivity guarantee.';

alter table public.fantasy_draft_picks enable row level security;

create policy "fantasy_draft_picks public read"
  on public.fantasy_draft_picks for select
  to anon, authenticated
  using (true);

-- No client write policies — RPC-only (fantasy_make_pick/fantasy_resolve_clock).

-- ── fantasy_draft_queues ────────────────────────────────────────────────────
create table public.fantasy_draft_queues (
  draft_id    uuid not null references public.fantasy_drafts(id) on delete cascade,
  team_id     uuid not null references public.fantasy_teams(id) on delete cascade,
  entries     jsonb not null default '[]'::jsonb,  -- ordered DraftRef[] ({playerLeague,playerId,playerName})
  updated_at  timestamptz not null default now(),
  primary key (draft_id, team_id)
);

comment on table public.fantasy_draft_queues is 'Private per-team autopick queue, owner-only. Written via fantasy_set_queue RPC; read directly by the owner (RLS-scoped SELECT — the contract reads it with the client, no RPC needed for reads).';

alter table public.fantasy_draft_queues enable row level security;

create policy "fantasy_draft_queues select own"
  on public.fantasy_draft_queues for select
  to authenticated
  using (public.fantasy_owns_team(team_id));

-- No INSERT/UPDATE policies — writes only via fantasy_set_queue (SECURITY DEFINER).

-- ── Realtime ─────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.fantasy_drafts;
alter publication supabase_realtime add table public.fantasy_draft_picks;

notify pgrst, 'reload schema';
