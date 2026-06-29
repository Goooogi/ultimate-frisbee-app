// /pul/g/[...id] — PUL game detail page.
//
// PUL game IDs contain forward slashes (e.g. "2026/finals/PHL-vs-DC"), which
// means a plain [id] segment would only capture the first part. We use a
// catch-all route [...id] and re-join the segments with '/' to reconstruct
// the full game id before passing it to getPulGame().
//
// URL encoding: Next.js automatically decodes each catch-all segment, so we
// don't need a manual decodeURIComponent here — the segments array already
// contains the decoded parts. We join them with '/' to form the full id.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPulGame, getPulGameBoxscore } from '@/lib/pul/data';
import { PulGameDetail } from '@/components/pul/pul-game-detail';

export const revalidate = 300; // 5 min — scores refresh frequently during season

interface Props {
  params: { id: string[] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = params.id.join('/');
  const game = await getPulGame(id).catch(() => null);
  if (!game) return { title: 'Game not found · The Layout' };

  const away = game.away;
  const home = game.home;
  const awayName = [away.city, away.mascot].filter(Boolean).join(' ') || away.abbrev;
  const homeName = [home.city, home.mascot].filter(Boolean).join(' ') || home.abbrev;

  const statusLabel = game.status === 'final' ? 'Final' : 'Upcoming';
  const scoreLabel =
    game.status === 'final' && away.score != null && home.score != null
      ? ` · ${away.score}–${home.score}`
      : '';

  return {
    title: `${awayName} vs ${homeName}${scoreLabel} · PUL · The Layout`,
    description: `${statusLabel}: ${awayName} vs ${homeName}. PUL ${game.season} ${game.weekLabel} game detail, box score, and stats.`,
  };
}

export default async function PulGamePage({ params }: Props) {
  const id = params.id.join('/');

  const game = await getPulGame(id).catch(() => null);
  if (!game) notFound();

  const boxscore = await getPulGameBoxscore(game).catch(() => ({ away: [], home: [] }));

  return <PulGameDetail game={game} boxscore={boxscore} />;
}
