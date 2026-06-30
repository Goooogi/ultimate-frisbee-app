// Generic "row of game tiles" section for the home page. Used twice — once
// for upcoming games and once for recent results. Caller provides title +
// subtitle (e.g. "UP NEXT · Next 4 games", "RECENT RESULTS · Last 4 finals").
// Each tile is a compact card showing both team rows + score + status.

import Link from 'next/link';
import type { UfaGame } from '@/lib/ufa/types';
import { teamMeta } from '@/lib/ufa/teams';
import { gameUiState, formatStartCompact } from '@/lib/ufa/format';
import { TeamLogo } from '@/components/team-logo';

interface GameGridSectionProps {
  /** Uppercase eyebrow on the left, e.g. "UP NEXT". */
  title: string;
  /** Trailing dynamic context (count, date range), e.g. "Next 4 games". */
  subtitle?: string;
  games: UfaGame[];
  /** Optional right-side action — defaults to a "Full schedule" link. */
  rightLink?: { label: string; href: string };
}

export function GameGridSection({
  title,
  subtitle,
  games,
  rightLink = { label: 'Full schedule', href: '/schedule' },
}: GameGridSectionProps) {
  if (games.length === 0) return null;

  return (
    <section aria-label={title} className="px-5 lg:px-12 pt-1 pb-6 lg:pb-8">
      <div className="flex items-baseline justify-between mb-4">
        <span className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase text-muted">
          {title}
          {subtitle && (
            <>
              <span className="mx-1.5 text-faint">·</span>
              <span className="text-ink">{subtitle}</span>
            </>
          )}
        </span>
        <Link
          href={rightLink.href}
          className="text-[11px] font-bold tracking-[0.14em] uppercase text-ink no-underline inline-flex items-center gap-1.5 hover:text-accent transition-colors"
        >
          {rightLink.label}
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

export function GameTile({ game }: { game: UfaGame }) {
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
      className="group bg-surface border border-border px-4 py-3.5 flex flex-col gap-2.5 hover:border-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex justify-between items-center font-mono text-[10.5px] text-muted tracking-[0.06em]">
        <span>{status}</span>
        {state.isLive && (
          <span className="inline-flex items-center gap-1.5 text-accent font-bold">
            <span
              className="w-[7px] h-[7px] rounded-full bg-accent shadow-[0_0_0_3px_rgb(var(--accent)/0.2)]"
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
        <span className="font-display italic font-bold text-[18px] text-ink tracking-[-0.02em]">
          {abbr}
        </span>
      </span>
      <span
        className={[
          'font-display font-bold text-[22px] tabular',
          winner ? 'text-ink' : 'text-muted',
        ].join(' ')}
      >
        {showScore ? score : '–'}
      </span>
    </div>
  );
}
