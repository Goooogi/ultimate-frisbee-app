'use client';

// Client-side live score refresh for UFA surfaces.
//
// Polls the /api/ufa proxy (NOT Supabase — UFA data comes from
// backend.ufastats.com) while any game in the slate is in play, and hands the
// freshest games back to the caller. The proxy caches games?current=true and
// ?gameID= responses at s-maxage=30, so every polling client shares one
// upstream hit per 30s window — poll volume does not multiply upstream load.
//
// Never polls slates that are entirely final/cancelled (historical pages), and
// skips ticks while the tab is hidden.

import { useEffect, useRef, useState } from 'react';
import { gameUiState } from '@/lib/ufa/format';
import type { UfaGame, UfaGamesResponse } from '@/lib/ufa/types';

const POLL_MS = 30_000;

// Also poll shortly before kickoff so Upcoming flips to Live without a reload
// (UFA can be slow to move the status string at the start of a game).
const PRE_START_MS = 45 * 60 * 1000;

function wantsFresh(games: UfaGame[]): boolean {
  return games.some((g) => {
    const s = gameUiState(g);
    if (s.isLive) return true;
    return (
      s.isUpcoming &&
      s.startDate !== null &&
      s.startDate.getTime() - Date.now() < PRE_START_MS
    );
  });
}

/**
 * Returns `initial` until a poll lands, then the freshest slate from
 * `/api/ufa/{query}`. `query` must be a games endpoint returning
 * `{ games: UfaGame[] }` (e.g. `games?current=true`, `games?gameID=X`).
 * `initial` must be referentially stable across renders (an RSC prop, or
 * memoized) or state resets on every render.
 */
export function useLiveGames(
  initial: UfaGame[],
  query: string,
  enabled = true,
): UfaGame[] {
  const [games, setGames] = useState(initial);
  useEffect(() => setGames(initial), [initial]);

  // Final/cancelled never revert, so an all-settled slate never needs a timer.
  const armed = enabled && initial.some((g) => {
    const s = gameUiState(g);
    return !s.isFinal && !s.isCancelled;
  });

  const gamesRef = useRef(games);
  gamesRef.current = games;

  useEffect(() => {
    if (!armed) return;
    let cancelled = false;

    const tick = async () => {
      if (document.hidden || !wantsFresh(gamesRef.current)) return;
      // Swallow transient network failures — the next tick retries anyway.
      const res = await fetch(`/api/ufa/${query}`).catch(() => null);
      if (!res?.ok || cancelled) return;
      const data = (await res.json().catch(() => null)) as UfaGamesResponse | null;
      if (!cancelled && Array.isArray(data?.games) && data.games.length > 0) {
        setGames(data.games);
      }
    };

    const id = setInterval(tick, POLL_MS);
    // Catch up immediately when the user returns to the tab instead of
    // waiting out the remainder of the interval.
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [armed, query]);

  return games;
}
