-- ─────────────────────────────────────────────────────────────────────────────
-- Fantasy Leagues & Contests — Phase 1, migration 3 of 8.
--
-- fantasy_league_invites — clone of pb_team_invites' shape (email invite,
-- Resend-sent, 14-day expiry, bind-to-email on accept). RLS enabled with NO
-- client policies at all: every access path is a SECURITY DEFINER RPC
-- (fantasy_create_league_invite / fantasy_preview_league_invite /
-- fantasy_accept_league_invite, migration 8) or the service role.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.fantasy_league_invites (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.fantasy_leagues(id) on delete cascade,
  email         text not null,
  token         text not null unique,
  invited_by    uuid not null references public.profiles(id) on delete cascade,
  expires_at    timestamptz not null default (now() + interval '14 days'),
  accepted_at   timestamptz,
  last_sent_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint fantasy_league_invites_email_lower check (email = lower(email))
);

-- An email can have only one outstanding (unaccepted) invite per league.
create unique index fantasy_league_invites_unique_pending
  on public.fantasy_league_invites (league_id, email)
  where accepted_at is null;

create index fantasy_league_invites_email_idx on public.fantasy_league_invites (email);

alter table public.fantasy_league_invites enable row level security;
-- No policies: RLS enabled + zero grants to anon/authenticated means every
-- row is inaccessible to client roles. All reads/writes route through
-- SECURITY DEFINER RPCs (which bypass RLS by running as the function owner)
-- or the service role.

comment on table public.fantasy_league_invites is 'Email-based league invites. NO client RLS policies — every access path is a SECURITY DEFINER RPC (create/preview/accept) or service role. Mirrors pb_team_invites.';

notify pgrst, 'reload schema';
