import 'server-only';

// Server-side fantasy reads for the SIGNED-IN user.
//
// Why this exists (fixes the "My Team" empty-state flash):
// The functions in data.ts (getMyTeam / getMyTeamRoster / getMyProfile) resolve
// the current user via the BROWSER Supabase client (createBrowserClient). In a
// Server Component that client has no cookie context, so auth.getUser() returns
// null and those reads come back empty — the server therefore renders My Team
// blank, and the real team name + roster only appear AFTER hydration when the
// client re-fetches. That transition is the visible lag.
//
// These variants use the cookie-aware SERVER client for the auth lookup, so the
// page can fetch the real team/roster/profile server-side and pass them in as
// props. The heavy joins reuse the isomorphic anon()-based helpers in data.ts
// (getFantasyTeam / getTeamRoster) — only the auth step needed to move.

import { createClient as createServerSupabase } from '@/lib/supabase/server';
import {
  fantasySeasonYear,
  getFantasyTeam,
  getTeamRoster,
  type FantasyTeamView,
  type RosterSlot,
  type MyProfile,
} from './data';

// The generated database.types.ts doesn't include the fantasy_* / profiles
// columns used here (same reason data.ts casts to an untyped client), so wrap
// the typed server client in a minimal query surface for these reads. auth is
// still fully typed — only the .from() table access is loosened.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = { from: (t: string) => any };

function serverDb() {
  const supabase = createServerSupabase();
  return { supabase, db: supabase as unknown as AnyQuery };
}

/** The signed-in user's beta team (league_id NULL, current season), fetched
 *  with server-side auth. null when signed out or no team yet. */
export async function getMyTeamServer(
  year = fantasySeasonYear(),
): Promise<FantasyTeamView | null> {
  const { supabase, db } = serverDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await db
    .from('fantasy_teams')
    .select('id')
    .eq('owner_id', user.id)
    .is('league_id', null)
    .eq('season_year', year)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return getFantasyTeam(data.id as string);
}

/** The signed-in user's saved roster for `week`, falling back to their most
 *  recent prior week that has slots (mirrors getMyTeamRoster in data.ts).
 *  Server-auth so it can run during the initial render. */
export async function getMyTeamRosterServer(week: string): Promise<RosterSlot[]> {
  const team = await getMyTeamServer();
  if (!team) return [];

  const current = await getTeamRoster(team.id, week);
  if (current.length > 0) return current;

  const { db } = serverDb();
  const { data: weeks } = await db
    .from('fantasy_roster_slots')
    .select('week')
    .eq('team_id', team.id);
  const latest = ((weeks ?? []) as Array<{ week: string }>)
    .map((r) => r.week)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
  if (!latest) return [];
  return getTeamRoster(team.id, latest);
}

/** The signed-in user's editable identity (display name + handle), server-auth. */
export async function getMyProfileServer(): Promise<MyProfile | null> {
  const { supabase } = serverDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // profiles IS in the generated types, so this stays fully typed.
  const { data } = await supabase
    .from('profiles')
    .select('display_name, username')
    .eq('id', user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    displayName: data.display_name ?? null,
    username: data.username ?? null,
  };
}
