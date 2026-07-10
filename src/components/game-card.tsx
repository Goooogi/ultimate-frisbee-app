'use client';

import Link from 'next/link';
import { teamMeta, type TeamMeta } from '@/lib/ufa/teams';
import { gameUiState, metaRight, statusLabel } from '@/lib/ufa/format';
import type { UfaGame } from '@/lib/ufa/types';
import { useTheme } from '@/lib/use-theme';
import { LiveDot, LiveDotAccent } from '@/components/live-dot';
import { TeamLogo } from '@/components/team-logo';

interface GameCardProps {
  game: UfaGame;
}

export function GameCard({ game }: GameCardProps) {
  const [theme] = useTheme();
  if (theme === 'broadcast') return <BcastGameCard game={game} />;
  return <FieldGameCard game={game} />;
}

// ── Field variant ─────────────────────────────────────────────────────────────

function FieldGameCard({ game }: { game: UfaGame }) {
  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const state = gameUiState(game);
  const label = statusLabel(state);
  const right = metaRight(game, state);

  return (
    <Link
      href={`/g/${game.gameID}`}
      className={[
        'block w-full bg-surface rounded-card shadow-card cursor-pointer',
        'px-4 py-3.5 pb-4 md:px-5 md:py-[18px] md:pb-5',
        'transition-shadow duration-150 hover:shadow-lift',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
      ].join(' ')}
    >
      {/* meta row */}
      <div className="flex justify-between items-center mb-2.5 md:mb-3.5">
        <span className="inline-flex items-center gap-1.5">
          {state.isLive && <LiveDot size={7} />}
          <span
            className={`text-[10px] font-bold tracking-[0.14em] uppercase font-tight ${
              state.isLive ? 'text-live' : 'text-muted'
            }`}
          >
            {label}
          </span>
        </span>
        <span className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase tabular font-tight">
          {right}
        </span>
      </div>

      <FieldTeamRow
        team={away}
        city={game.awayTeamCity}
        name={game.awayTeamName}
        score={game.awayScore}
        winning={state.awayWin}
        showScore={state.hasScore || state.isLive || state.isFinal}
      />

      <div className="h-px bg-hairline my-0.5 md:my-1" />

      <FieldTeamRow
        team={home}
        city={game.homeTeamCity}
        name={game.homeTeamName}
        score={game.homeScore}
        winning={state.homeWin}
        showScore={state.hasScore || state.isLive || state.isFinal}
      />

      {state.isClose && (
        <div className="mt-2.5 md:mt-3">
          <span className="inline-flex items-center text-[10.5px] font-bold tracking-[0.12em] uppercase text-accent bg-accent/10 rounded-full px-2.5 py-[5px]">
            Close game
          </span>
        </div>
      )}
      {state.isUpcoming && game.locationName && (
        <div className="mt-2.5 md:mt-3 text-[10px] font-semibold tracking-[0.08em] uppercase text-faint font-tight truncate">
          {game.locationName}
        </div>
      )}
    </Link>
  );
}

function FieldTeamRow({
  team,
  city,
  name,
  score,
  winning,
  showScore,
}: {
  team: TeamMeta;
  city: string;
  name: string;
  score: number;
  winning: boolean;
  showScore: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 md:py-2">
      <div className="flex items-center gap-3 md:gap-3.5 min-w-0">
        <TeamLogo team={team} size={32} className="rounded-[2px]" />
        <span className="min-w-0 flex flex-col">
          <span
            className={`text-[16px] md:text-[19px] font-tight tracking-[-0.01em] text-ink truncate ${
              winning ? 'font-bold' : 'font-medium'
            }`}
          >
            {city} {name}
          </span>
        </span>
      </div>
      <span className="flex items-center gap-2 flex-shrink-0 ml-4">
        {winning && (
          <span className="w-[5px] h-[5px] rounded-full bg-accent flex-shrink-0" aria-hidden="true" />
        )}
        <span
          className={`tabular leading-none font-tight tracking-[-0.04em] ${
            showScore ? 'text-ink' : 'text-faint'
          } ${winning ? 'font-bold' : 'font-medium'}`}
          style={{ fontSize: 26 }}
        >
          {showScore ? score : '–'}
        </span>
      </span>
    </div>
  );
}

// ── Broadcast variant ─────────────────────────────────────────────────────────

function BcastGameCard({ game }: { game: UfaGame }) {
  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const state = gameUiState(game);
  const label = statusLabel(state);
  const right = metaRight(game, state);

  return (
    <Link
      href={`/g/${game.gameID}`}
      className={[
        'block w-full bg-surface rounded-card shadow-card cursor-pointer',
        'px-4 py-3.5 pb-4 md:px-6 md:py-5 md:pb-[22px]',
        'relative overflow-hidden transition-shadow duration-150 hover:shadow-lift',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      ].join(' ')}
    >
      <div className="flex justify-between items-center mb-3 md:mb-3.5 font-sans">
        <span className="inline-flex items-center gap-[7px]">
          {state.isLive && <LiveDotAccent size={9} />}
          <span
            className={`text-[10px] font-bold tracking-[0.2em] uppercase ${
              state.isLive ? 'text-accent' : 'text-muted'
            }`}
          >
            {label}
          </span>
          {state.isClose && (
            <>
              <span className="w-[3px] h-[3px] rounded-full bg-faint" aria-hidden="true" />
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink">
                One-pt game
              </span>
            </>
          )}
        </span>
        <span className="font-display text-[16px] md:text-[20px] font-semibold tracking-[0.04em] text-ink uppercase tabular">
          {right}
        </span>
      </div>

      <BcastTeamRow
        team={away}
        city={game.awayTeamCity}
        name={game.awayTeamName}
        score={game.awayScore}
        win={state.awayWin}
        lose={state.homeWin}
        showScore={state.hasScore || state.isLive || state.isFinal}
      />

      <div className="h-px bg-hairline my-1" />

      <BcastTeamRow
        team={home}
        city={game.homeTeamCity}
        name={game.homeTeamName}
        score={game.homeScore}
        win={state.homeWin}
        lose={state.awayWin}
        showScore={state.hasScore || state.isLive || state.isFinal}
      />
    </Link>
  );
}

function BcastTeamRow({
  team,
  city,
  name,
  score,
  win,
  lose,
  showScore,
}: {
  team: TeamMeta;
  city: string;
  name: string;
  score: number;
  win: boolean;
  lose: boolean;
  showScore: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 md:py-2 transition-opacity ${
        lose ? 'opacity-65' : 'opacity-100'
      }`}
    >
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <TeamLogo team={team} size={36} />

        <div className="flex flex-col min-w-0 gap-[1px]">
          <span className="font-sans text-[11px] font-semibold tracking-[0.1em] text-muted uppercase truncate">
            {city}
          </span>
          <span className="font-display text-[22px] md:text-[28px] font-semibold text-ink tracking-[0.01em] leading-none uppercase truncate">
            {name}
          </span>
        </div>
      </div>

      <span
        className="font-display tabular leading-[0.9] ml-4 flex-shrink-0 font-bold tracking-[-0.01em] text-[52px] md:text-[64px]"
        style={{
          color: showScore
            ? win
              ? 'rgb(var(--ink))'
              : 'rgb(var(--muted))'
            : 'rgb(var(--faint))',
        }}
      >
        {showScore ? score : '–'}
      </span>
    </div>
  );
}
