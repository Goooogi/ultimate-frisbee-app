// Season game log for a PUL / WUL team page — every game the team played,
// from THAT team's perspective (W/L pill, opponent, score, date), linking to
// the game detail. PUL and WUL share identical game/side shapes, so one
// component serves both (league sets the logo component + detail href).
//
// UFA already shows its full schedule on /teams/[id] via GameCard; USAU is
// event-based (placements, not games). This closes the gap for PUL/WUL, which
// previously showed roster only. Backlog #12.

import Link from 'next/link';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { WulTeamLogo } from '@/components/wul-team-logo';
import type { PulGame } from '@/lib/pul/data';
import type { WulGame } from '@/lib/wul/data';

type ProGame = PulGame | WulGame;

/** Encode a game id (may contain '/') into a catch-all route segment path. */
function gameHref(league: 'pul' | 'wul', id: string): string {
  return `/${league}/g/${id.split('/').map(encodeURIComponent).join('/')}`;
}

function TeamLogoFor({
  league,
  side,
  size,
}: {
  league: 'pul' | 'wul';
  side: ProGame['away'];
  size: number;
}) {
  // The two logo components want slightly different shapes; build each from the
  // shared game-side fields (both fall back to initials when logoUrl is null).
  if (league === 'pul') {
    return (
      <PulTeamLogo
        team={{
          id: side.teamId,
          name: side.mascot ?? side.abbrev,
          city: side.city ?? '',
          mascot: side.mascot ?? side.abbrev,
          logoUrl: side.logoUrl,
          accentColor: side.accentColor,
        }}
        size={size}
      />
    );
  }
  return (
    <WulTeamLogo
      team={{ id: side.teamId, abbr: side.abbrev, logoUrl: side.logoUrl, accentColor: side.accentColor }}
      size={size}
    />
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ProTeamGameLog({
  teamId,
  games,
  league,
  season,
}: {
  teamId: string;
  games: ProGame[];
  league: 'pul' | 'wul';
  season: number;
}) {
  // This team's games, most-recent first (final games only carry a result).
  const teamGames = games
    .filter((g) => g.away.teamId === teamId || g.home.teamId === teamId)
    .sort((a, b) => (b.gameDate ?? '').localeCompare(a.gameDate ?? ''));

  if (teamGames.length === 0) return null;

  return (
    <section aria-labelledby="gamelog-heading" className="mt-8">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <span className="block text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-2">
            {season} Season
          </span>
          <h2
            id="gamelog-heading"
            className="font-display italic font-bold text-[22px] lg:text-[26px] leading-[0.95] tracking-[-0.02em] text-ink m-0"
          >
            Game Log
          </h2>
        </div>
        <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-faint tabular pb-1">
          {teamGames.length} {teamGames.length === 1 ? 'game' : 'games'}
        </span>
      </div>

      <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
        {teamGames.map((g, idx) => (
          <GameRow key={g.id} game={g} teamId={teamId} league={league} first={idx === 0} />
        ))}
      </div>
    </section>
  );
}

function GameRow({
  game,
  teamId,
  league,
  first,
}: {
  game: ProGame;
  teamId: string;
  league: 'pul' | 'wul';
  first: boolean;
}) {
  const isHome = game.home.teamId === teamId;
  const me = isHome ? game.home : game.away;
  const opp = isHome ? game.away : game.home;

  const myScore = me.score;
  const oppScore = opp.score;
  const isFinal = game.status === 'final' && myScore != null && oppScore != null;
  const win = isFinal && myScore! > oppScore!;
  const loss = isFinal && myScore! < oppScore!;

  const oppName = [opp.city, opp.mascot].filter(Boolean).join(' ') || opp.abbrev;

  const inner = (
    <div className={['flex items-center gap-3 px-4 py-3', first ? '' : 'border-t border-hairline'].join(' ')}>
      {/* Result pill */}
      <span
        className={[
          'shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] font-bold font-tight',
          win ? 'bg-accent text-accent-ink' : loss ? 'bg-ink/[0.08] text-muted' : 'bg-ink/5 text-faint',
        ].join(' ')}
        aria-hidden="true"
      >
        {isFinal ? (win ? 'W' : 'L') : '–'}
      </span>

      {/* Opponent logo + name */}
      <span className="shrink-0 inline-flex rounded-full overflow-hidden">
        <TeamLogoFor league={league} side={opp} size={26} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-tight text-[14px] font-semibold text-ink truncate">
          <span className="text-faint font-medium">{isHome ? 'vs' : '@'} </span>
          {oppName}
        </span>
        {game.gameDate && (
          <span className="block text-[10.5px] text-faint font-tight tabular">{formatDate(game.gameDate)}</span>
        )}
      </span>

      {/* Score */}
      <span className="shrink-0 font-tight text-[15px] font-bold tabular text-right">
        {isFinal ? (
          <>
            <span className={win ? 'text-ink' : 'text-muted'}>{myScore}</span>
            <span className="text-faint mx-0.5">–</span>
            <span className={loss ? 'text-ink' : 'text-muted'}>{oppScore}</span>
          </>
        ) : (
          <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-faint">
            {game.gameDate ? 'Upcoming' : 'TBD'}
          </span>
        )}
      </span>
    </div>
  );

  // Final games link to the matchup detail; scheduled games are static.
  return isFinal ? (
    <Link
      href={gameHref(league, game.id)}
      className="block hover:bg-surface-hi transition-colors duration-150 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}
