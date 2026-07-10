// Favorites data layer — a signed-in user's favorite leagues + teams.
//
// All reads AND writes are owner-scoped private data (unlike fantasy/profiles,
// whose reads are public). Every call uses the session-aware client so
// auth.getUser() + owner-only RLS (user_favorite_*_own policies) apply. owner
// id is always derived from the session, never trusted from the client.
//
// A favorite team is the (league, teamId) pair the app already routes on
// (resultHref in usau/search-nav.ts), with name/logo denormalized so the
// favorites list renders without joining six league tables.

import { createClient as createSessionClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// user_favorite_* tables aren't in database.types.ts — untyped client + casts,
// same convention as fantasy/pul/wul data layers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

function sessionClient(): AnyClient {
  return createSessionClient() as unknown as AnyClient;
}

// ─── Types ──────────────────────────────────────────────────────────────────

/** The five leagues a team/league favorite can belong to (matches the DB CHECK
 *  and resultHref's routing switch). */
export type FavoriteLeague = 'ufa' | 'usau' | 'pul' | 'wul' | 'wfdf';

export const FAVORITE_LEAGUES: readonly FavoriteLeague[] = [
  'ufa', 'usau', 'pul', 'wul', 'wfdf',
] as const;

export interface FavoriteTeam {
  league: FavoriteLeague;
  teamId: string;
  name: string;
  logoUrl: string | null;
}

export interface MyFavorites {
  leagues: FavoriteLeague[];
  teams: FavoriteTeam[];
}

/** Hard cap so a script can't balloon a user's favorites row set. Enforced
 *  client-side here AND worth a DB trigger later if it ever matters. */
export const MAX_FAVORITE_TEAMS = 50;

// ─── Reads ──────────────────────────────────────────────────────────────────

/** The signed-in user's favorites, or empty lists when not signed in. */
export async function getMyFavorites(): Promise<MyFavorites> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { leagues: [], teams: [] };

  const [teamsRes, leaguesRes] = await Promise.all([
    supabase
      .from('user_favorite_teams')
      .select('league, team_id, name, logo_url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_favorite_leagues')
      .select('league')
      .eq('user_id', user.id),
  ]);

  if (teamsRes.error) throw teamsRes.error;
  if (leaguesRes.error) throw leaguesRes.error;

  const teams: FavoriteTeam[] = ((teamsRes.data ?? []) as {
    league: FavoriteLeague; team_id: string; name: string; logo_url: string | null;
  }[]).map((r) => ({
    league: r.league,
    teamId: r.team_id,
    name: r.name,
    logoUrl: r.logo_url ?? null,
  }));

  const leagues = ((leaguesRes.data ?? []) as { league: FavoriteLeague }[])
    .map((r) => r.league);

  return { leagues, teams };
}

// ─── Team writes ──────────────────────────────────────────────────────────────

/**
 * Add a favorite team. Idempotent (upsert on the (user, league, team) PK).
 * Throws if the user is at MAX_FAVORITE_TEAMS. owner id comes from the session.
 */
export async function addFavoriteTeam(team: FavoriteTeam): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // Count guard — count existing (excludes this team if it's already there).
  const { count, error: countErr } = await supabase
    .from('user_favorite_teams')
    .select('team_id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if (countErr) throw countErr;
  if ((count ?? 0) >= MAX_FAVORITE_TEAMS) {
    // Allow a re-favorite of an existing team (upsert), block genuinely-new ones.
    const { data: existing } = await supabase
      .from('user_favorite_teams')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('league', team.league)
      .eq('team_id', team.teamId)
      .maybeSingle();
    if (!existing) {
      throw new Error(`You can favorite up to ${MAX_FAVORITE_TEAMS} teams.`);
    }
  }

  const { error } = await supabase.from('user_favorite_teams').upsert(
    {
      user_id: user.id,
      league: team.league,
      team_id: team.teamId,
      name: team.name,
      logo_url: team.logoUrl,
    },
    { onConflict: 'user_id,league,team_id' },
  );
  if (error) throw error;
}

/** Remove a favorite team by its (league, teamId). No-op if not favorited. */
export async function removeFavoriteTeam(
  league: FavoriteLeague,
  teamId: string,
): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('user_favorite_teams')
    .delete()
    .eq('user_id', user.id)
    .eq('league', league)
    .eq('team_id', teamId);
  if (error) throw error;
}

// ─── League writes ────────────────────────────────────────────────────────────

/**
 * Replace the user's favorite-league set with exactly `leagues`. Diffs against
 * the current set so we only insert added / delete removed rows (keeps
 * created_at stable for untouched leagues). owner id from the session.
 */
export async function setFavoriteLeagues(leagues: FavoriteLeague[]): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  // De-dupe + validate against the allowed set.
  const want = [...new Set(leagues)].filter((l) => FAVORITE_LEAGUES.includes(l));

  const { data: currentRows, error: readErr } = await supabase
    .from('user_favorite_leagues')
    .select('league')
    .eq('user_id', user.id);
  if (readErr) throw readErr;
  const have = new Set(((currentRows ?? []) as { league: FavoriteLeague }[]).map((r) => r.league));

  const toAdd = want.filter((l) => !have.has(l));
  const toRemove = [...have].filter((l) => !want.includes(l));

  if (toAdd.length) {
    const { error } = await supabase
      .from('user_favorite_leagues')
      .insert(toAdd.map((league) => ({ user_id: user.id, league })));
    if (error) throw error;
  }
  if (toRemove.length) {
    const { error } = await supabase
      .from('user_favorite_leagues')
      .delete()
      .eq('user_id', user.id)
      .in('league', toRemove);
    if (error) throw error;
  }
}
