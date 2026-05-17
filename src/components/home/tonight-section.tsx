// "Tonight · N more games" — section header + 4-up game tile grid.
// Each tile is a compact card showing both team rows + score + status.

import Link from 'next/link';
import type { UfaGame } from '@/lib/ufa/types';
import { teamMeta } from '@/lib/ufa/teams';
import { gameUiState, formatStartCompact } from '@/lib/ufa/format';
import { TeamLogo } from '@/components/team-logo';

const ACCENT = '#FF3D00';

interface TonightSectionProps {
  games: UfaGame[];
}

export function TonightSection({ games }: TonightSectionProps) {
  if (games.length === 0) return null;

  const label = games.length === 1 ? '1 more game' : `${games.length} more games`;

  return (
    <section aria-label="Tonight's games" className="px-5 lg:px-12 pt-1 pb-6 lg:pb-8">
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-[#6F6B62]">
          Tonight · {label}
        </span>
        <Link
          href="/schedule"
          className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#0E0E0C] no-underline inline-flex items-center gap-1.5 hover:text-[#FF3D00] transition-colors"
        >
          Full schedule
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8H13M13 8L8.5 3.5M13 8L8.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {games.map((g) => (
          <GameTile key={g.gameID} game={g} />
        ))}
      </div>
    </section>
  );
}

function GameTile({ game }: { game: UfaGame }) {
  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const state = gameUiState(game);
  const status = state.isLive
    ? 'LIVE'
    : state.isFinal
      ? 'FINAL'
      : formatStartCompact(game).toUpperCase();

  return (
    <Link
      href={`/g/${game.gameID}`}
      className="group bg-white border border-[#E5E1D6] px-4 py-3.5 flex flex-col gap-2.5 hover:border-[#0E0E0C] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3D00]"
    >
      <div className="flex justify-between items-center font-mono text-[10.5px] text-[#6F6B62] tracking-[0.06em]">
        <span>{status}</span>
        {state.isLive && (
          <span className="inline-flex items-center gap-1.5 text-[#FF3D00] font-bold">
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: ACCENT, boxShadow: `0 0 0 3px ${ACCENT}33` }}
            />
            LIVE
          </span>
        )}
      </div>
      <TileRow
        slug={away.id}
        abbr={away.abbr}
        score={game.awayScore}
        winner={state.awayWin}
        loser={state.homeWin}
        showScore={state.hasScore || state.isLive || state.isFinal}
      />
      <TileRow
        slug={home.id}
        abbr={home.abbr}
        score={game.homeScore}
        winner={state.homeWin}
        loser={state.awayWin}
        showScore={state.hasScore || state.isLive || state.isFinal}
      />
    </Link>
  );
}

function TileRow({
  slug,
  abbr,
  score,
  winner,
  loser,
  showScore,
}: {
  slug: string;
  abbr: string;
  score: number;
  winner: boolean;
  loser: boolean;
  showScore: boolean;
}) {
  const meta = teamMeta(slug);
  return (
    <div
      className="flex items-center justify-between transition-opacity"
      style={{ opacity: loser ? 0.55 : 1 }}
    >
      <span className="inline-flex items-center gap-2.5">
        <TeamLogo team={meta} size={20} />
        <span className="font-display italic font-bold text-[18px] text-[#0E0E0C] tracking-[-0.02em]">
          {abbr}
        </span>
      </span>
      <span
        className="font-display font-bold text-[22px] tabular"
        style={{ color: winner ? '#0E0E0C' : '#6F6B62' }}
      >
        {showScore ? score : '–'}
      </span>
    </div>
  );
}
