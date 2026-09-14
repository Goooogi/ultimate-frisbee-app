// Server-only cache over getGameStartDates for the pages that render it (the
// hub and /fantasy/leagues/new). The create page reads searchParams, which
// forces a per-request dynamic render — without this every visit would fan out
// one query per game (App Health rules 1 and 3). Same approach as
// src/lib/cached-readers.ts; kept out of game-dates.ts because next/cache is
// server-only and the create form imports game-dates on the client.
//
// A 5-minute-old entry can't create a league on an event that has since
// started: the form re-checks its game with the uncached nextStartForGame
// right before creating anything.

import 'server-only';
import { unstable_cache } from 'next/cache';
import { getGameStartDates } from './game-dates';

const REVALIDATE_SECONDS = 300;

export const getGameStartDatesCached = unstable_cache(
  () => getGameStartDates(),
  ['fantasy-game-start-dates'],
  { revalidate: REVALIDATE_SECONDS },
);
