'use client';

// Favorites settings card — thin wrapper around the shared <FavoritesPicker>
// (league-first: each league expands to a scoped team search with teams nested
// under it). This file owns only the card chrome + initial load; the picker
// owns the interaction + persistence. The same picker is reused by the
// post-signup onboarding modal (favorites-onboarding-modal.tsx).

import { useEffect, useState } from 'react';
import {
  getMyFavorites,
  type FavoriteLeague,
  type FavoriteTeam,
} from '@/lib/favorites/data';
import { FavoritesPicker } from '@/components/settings/favorites-picker';

export function FavoritesSettings() {
  const [initial, setInitial] = useState<{ leagues: FavoriteLeague[]; teams: FavoriteTeam[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    getMyFavorites()
      .then((f) => {
        setInitial({ leagues: f.leagues, teams: f.teams });
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-hairline">
        <h2 className="m-0 font-tight text-[11px] font-bold tracking-[0.18em] uppercase text-muted">
          Favorites
        </h2>
        <p className="mt-1 text-[12px] text-faint font-tight leading-snug">
          Pick the leagues you follow — and a favorite team or two under each — and we&apos;ll use these to personalize what you see.
        </p>
      </div>

      <div className="px-5 py-5">
        {loading && (
          <div className="py-6 flex justify-center">
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase font-tight text-faint animate-pulse">
              Loading…
            </span>
          </div>
        )}

        {!loading && (loadError || !initial) && (
          <div
            role="alert"
            className="px-4 py-3 rounded-card-sm bg-live/[0.08]"
          >
            <span className="font-tight text-[13px] text-ink">
              Couldn&apos;t load your favorites. Please refresh and try again.
            </span>
          </div>
        )}

        {!loading && !loadError && initial && (
          <FavoritesPicker initialLeagues={initial.leagues} initialTeams={initial.teams} />
        )}
      </div>
    </div>
  );
}
