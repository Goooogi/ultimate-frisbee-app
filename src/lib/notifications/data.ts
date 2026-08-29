// Notification prefs data layer — the two web-editable push toggles
// (event_updates, player_stats). Mirrors src/lib/favorites/data.ts: owner-
// scoped, session-aware client, owner id always derived from the session.
//
// notification_prefs is in database.types.ts but the generated Row/Insert/
// Update shapes there predate the event_updates/player_stats columns (added
// by a migration outside this repo's tracked history — see
// supabase/migrations/20260827070000_fantasy_league_settings_rpcs.sql-adjacent
// work). Untyped client + casts, same convention as favorites/fantasy.
//
// Missing row = every pref ON (game_start/game_final/news/event_updates/
// player_stats all DEFAULT true) — never write a partial row, it would flip
// unwritten columns back to their (also-true) defaults, which happens to be
// safe here, but the upsert below still always sends both fields explicitly
// so this never silently narrows to "insert whatever's given."

import { createClient as createSessionClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>;

function sessionClient(): AnyClient {
  return createSessionClient() as unknown as AnyClient;
}

export interface NotificationPrefs {
  eventUpdates: boolean;
  playerStats: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = { eventUpdates: true, playerStats: true };

/** The signed-in user's web-editable prefs. A missing row means everything is
 *  on, so this returns the all-true defaults rather than throwing. */
export async function getMyNotificationPrefs(): Promise<NotificationPrefs> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...DEFAULT_PREFS };

  const { data, error } = await supabase
    .from('notification_prefs')
    .select('event_updates, player_stats')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULT_PREFS };

  return {
    eventUpdates: (data as { event_updates: boolean }).event_updates,
    playerStats: (data as { player_stats: boolean }).player_stats,
  };
}

/** Set one pref. Upserts, sending the OTHER pref's current value alongside so
 *  a first-ever write never lands a partial row — the caller passes the full
 *  current state, not just the changed key. */
export async function setNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  const supabase = sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase.from('notification_prefs').upsert(
    {
      user_id: user.id,
      event_updates: prefs.eventUpdates,
      player_stats: prefs.playerStats,
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}
