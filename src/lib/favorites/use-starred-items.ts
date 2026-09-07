'use client';

// useStarredItems — the signed-in user's starred games + tournaments resolved
// to live objects, for the home hero and For You. Keyed by user + the star id
// signature so a star/unstar elsewhere refetches on remount; fetches only when
// something is starred; empty until loaded. Pass the already-loaded favorites
// when the caller has them (For You); omit to load them here (home).
// (Web twin of mobile's react-query hook — web has no query client.)

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { getMyFavorites, type FavoriteEvent, type FavoriteGame } from '@/lib/favorites/data';
import { getStarredItems } from '@/lib/favorites/starred';
import { EMPTY_STARRED, type StarredItems } from '@/lib/favorites/starred-feed';

type StarFavorites = { games: FavoriteGame[]; events: FavoriteEvent[] };

function signature(f: StarFavorites | null): string {
  if (!f) return '';
  return [
    ...f.games.map((g) => `${g.league}:${g.gameId}`),
    ...f.events.map((e) => `${e.league}:${e.eventId}`),
  ]
    .sort()
    .join('|');
}

export function useStarredItems(favorites?: StarFavorites | null): {
  items: StarredItems;
  loading: boolean;
} {
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<StarFavorites | null>(null);
  const [items, setItems] = useState<StarredItems>(EMPTY_STARRED);
  const [loading, setLoading] = useState(false);

  // Self-load favorites only when the caller didn't hand them over.
  const selfLoad = favorites === undefined;
  useEffect(() => {
    if (!selfLoad) return;
    if (!user) {
      setLoaded(null);
      return;
    }
    let cancelled = false;
    getMyFavorites()
      .then((f) => {
        if (!cancelled) setLoaded({ games: f.games, events: f.events });
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selfLoad, user]);

  const source = selfLoad ? loaded : (favorites ?? null);
  const sig = useMemo(() => signature(source), [source]);
  const key = user ? `${user.id}|${sig}` : '';

  useEffect(() => {
    if (!key || !sig || !source) {
      setItems(EMPTY_STARRED);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getStarredItems({ games: source.games, events: source.events })
      .then((res) => {
        if (!cancelled) setItems(res);
      })
      .catch(() => {
        if (!cancelled) setItems(EMPTY_STARRED);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `source` is folded into `key` via its signature; re-running on the object
    // identity would refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { items, loading };
}
