// Lazy boxscore endpoint — fans out to roster-game-stats-for-player for every
// rostered player in this game. Called from the GameBoxscore client component
// when the user expands "Full player breakdown".
//
// Cached at the route level for 5 min; per-player game logs are independently
// cached for 1h by getPlayerGameLog, so warm calls resolve from the inner cache.

import { NextResponse } from 'next/server';
import { getGameBoxscore } from '@/lib/ufa/client';

export const revalidate = 300;

interface Ctx {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const boxscore = await getGameBoxscore(params.id);
    return NextResponse.json(boxscore, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
