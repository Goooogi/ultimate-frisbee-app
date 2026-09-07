'use server';

// Starred items — resolve a user's starred games + tournaments to the live
// objects the hero slides / For You tiles render. Server action (UFA's client
// is server-only, and the per-star fetch fan-out stays off the browser); the
// client passes its already-loaded favorites, like getForYouFeed.
//
// Keeps ONLY what's ahead or live: UFA drops final/cancelled, PUL/WUL drop
// status='final', events drop when (end_date ?? start_date) < today — checked
// on the denormalized favorite dates BEFORE fetching. A failed fetch drops
// that star silently. Sorted soonest first.
// (Ported from mobile's src/lib/favorites/starred.ts — keep in sync.)

import { createClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';
import type { FavoriteEvent, FavoriteGame } from '@/lib/favorites/data';
import { getGameById } from '@/lib/ufa/client';
import { gameUiState } from '@/lib/ufa/format';
import { getPulGame } from '@/lib/pul/data';
import { getWulGame } from '@/lib/wul/data';
import { getEvent as getUsauEvent } from '@/lib/usau/data';
import { getEvent as getWfdfEvent } from '@/lib/wfdf/data';
import { getEvent as getEufEvent } from '@/lib/euf/data';
import type { StarredEventItem, StarredGameItem, StarredItems } from '@/lib/favorites/starred-feed';

const EVENT_TABLES: Record<FavoriteEvent['league'], { table: string; slugCol: string }> = {
  usau: { table: 'usau_events', slugCol: 'usau_slug' },
  wfdf: { table: 'wfdf_events', slugCol: 'slug' },
  euf: { table: 'euf_events', slugCol: 'slug' },
};

/** Starred events store the event UUID; the event pages route by slug. */
export async function resolveEventSlug(
  league: FavoriteEvent['league'],
  eventId: string,
): Promise<string | null> {
  const { table, slugCol } = EVENT_TABLES[league];
  const db = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false } });
  const { data, error } = await db.from(table).select(slugCol).eq('id', eventId).maybeSingle();
  if (error) throw error;
  const slug = (data as Record<string, unknown> | null)?.[slugCol];
  return typeof slug === 'string' && slug ? slug : null;
}

const dateTs = (iso: string | null): number =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).getTime() : Number.MAX_SAFE_INTEGER;

export async function getStarredItems(favorites: {
  games: FavoriteGame[];
  events: FavoriteEvent[];
}): Promise<StarredItems> {
  const today = new Date().toISOString().slice(0, 10);

  const gameItems = await Promise.all(
    favorites.games.map(async (f): Promise<StarredGameItem | null> => {
      try {
        if (f.league === 'ufa') {
          const game = await getGameById(f.gameId);
          if (!game) return null;
          const s = gameUiState(game);
          if (s.isFinal || s.isCancelled) return null;
          return { league: 'ufa', game, sortTs: dateTs(game.startTimestamp ?? null) };
        }
        if (f.league === 'pul') {
          const game = await getPulGame(f.gameId);
          if (!game || game.status === 'final') return null;
          return { league: 'pul', game, sortTs: dateTs(game.gameDate) };
        }
        const game = await getWulGame(f.gameId);
        if (!game || game.status === 'final') return null;
        return { league: 'wul', game, sortTs: dateTs(game.gameDate) };
      } catch {
        return null;
      }
    }),
  );

  const eventItems = await Promise.all(
    favorites.events
      .filter((f) => (f.endDate ?? f.startDate ?? '') >= today)
      .map(async (f): Promise<StarredEventItem | null> => {
        try {
          const slug = await resolveEventSlug(f.league, f.eventId);
          if (!slug) return null;
          if (f.league === 'usau') {
            const event = await getUsauEvent(slug);
            return event ? { league: 'usau', event, sortTs: dateTs(event.startDate) } : null;
          }
          if (f.league === 'wfdf') {
            const detail = await getWfdfEvent(slug);
            if (!detail) return null;
            // Trim to the card fields — the detail carries every team + game.
            const event = {
              id: detail.id, slug: detail.slug, name: detail.name, year: detail.year, kind: detail.kind,
              location: detail.location, startDate: detail.startDate, endDate: detail.endDate,
              isNationalTeams: detail.isNationalTeams, logoUrl: detail.logoUrl, teamCount: detail.teamCount,
            };
            return { league: 'wfdf', event, sortTs: dateTs(event.startDate) };
          }
          const event = await getEufEvent(slug);
          return event ? { league: 'euf', event, sortTs: dateTs(event.startDate) } : null;
        } catch {
          return null;
        }
      }),
  );

  const bySoonest = (a: { sortTs: number }, b: { sortTs: number }) => a.sortTs - b.sortTs;
  return {
    games: gameItems.filter((x): x is StarredGameItem => x !== null).sort(bySoonest),
    events: eventItems.filter((x): x is StarredEventItem => x !== null).sort(bySoonest),
  };
}
