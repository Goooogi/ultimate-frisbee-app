// Server-only caching layer over the public league readers.
//
// The pages that consume these (/scores, /players, home standings) read
// `searchParams`, which forces per-request dynamic rendering — so their
// route-level `revalidate` exports never take effect and every request would
// otherwise hit Supabase. All of this data is public (world-readable RLS, anon
// client), so we can safely memoize it across requests with `unstable_cache`,
// keyed by the reader's own arguments and refreshed every 5 minutes.
//
// This lives in its own `server-only` module on purpose: the raw data modules
// (e.g. usau/data.ts) are intentionally importable from client components
// (live player search, mega-menu). `next/cache` is server-only, so keeping the
// cache wrappers out of those modules avoids pulling server APIs into the
// client bundle. Client components keep importing the raw readers directly.

import 'server-only';
import { unstable_cache } from 'next/cache';

import {
  recentUsauTournamentCards as _recentUsauTournamentCards,
  listOfficialUsauRankings as _listOfficialUsauRankings,
  listUsauPlayers as _listUsauPlayers,
  type CompetitionLevel,
} from '@/lib/usau/data';
import {
  listPulPlayers as _listPulPlayers,
  getPulStandings as _getPulStandings,
} from '@/lib/pul/data';
import {
  listWulPlayers as _listWulPlayers,
  getWulStandings as _getWulStandings,
} from '@/lib/wul/data';

// Public standings/leaderboard data changes at most a few times a day during
// a season; 5 minutes keeps it fresh while collapsing repeat traffic to one
// DB read per window.
const REVALIDATE_SECONDS = 300;

// Wrapped as a closure so the reader's `now: Date` default stays out of
// the cache key (a Date wouldn't serialize into one cleanly). Callers never
// pass `now`, so this preserves behavior exactly. The competition level IS
// a serialized cache-key arg, so each level memoizes independently.
export const recentUsauTournamentCardsCached = unstable_cache(
  (competitionLevel: CompetitionLevel = 'CLUB') =>
    _recentUsauTournamentCards(undefined, undefined, competitionLevel),
  ['usau-recent-tournament-cards'],
  { revalidate: REVALIDATE_SECONDS },
);

export const listOfficialUsauRankingsCached = unstable_cache(
  _listOfficialUsauRankings,
  ['usau-official-rankings'],
  { revalidate: REVALIDATE_SECONDS },
);

// Cached variant for the SERVER call site only. The client-side live search in
// players-search-list.tsx must keep calling the raw `listUsauPlayers` (browser
// can't run unstable_cache), so we do not touch that export.
export const listUsauPlayersCached = unstable_cache(
  _listUsauPlayers,
  ['usau-players'],
  { revalidate: REVALIDATE_SECONDS },
);

export const listPulPlayersCached = unstable_cache(
  _listPulPlayers,
  ['pul-players'],
  { revalidate: REVALIDATE_SECONDS },
);

export const getPulStandingsCached = unstable_cache(
  _getPulStandings,
  ['pul-standings'],
  { revalidate: REVALIDATE_SECONDS },
);

export const listWulPlayersCached = unstable_cache(
  _listWulPlayers,
  ['wul-players'],
  { revalidate: REVALIDATE_SECONDS },
);

export const getWulStandingsCached = unstable_cache(
  _getWulStandings,
  ['wul-standings'],
  { revalidate: REVALIDATE_SECONDS },
);
