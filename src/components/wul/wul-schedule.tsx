// WUL Schedule — server component. WUL has no future fixtures (the source is
// completed-games only), so "schedule" here is the full multi-season history:
// every season's games grouped by season (newest first), and within a season
// by phase (Regular Season, then Postseason). This makes it a useful archive
// distinct from /scores (which shows the current season only).

import Link from 'next/link';
import {
  listWulGames,
  listWulSeasons,
  deriveWulPostseasonRounds,
  WUL_CURRENT_SEASON,
  type WulGame,
  type WulGameTeamSide,
  type WulPostseasonRound,
} from '@/lib/wul/data';
import { WulTeamLogo } from '@/components/wul-team-logo';

export async function WulSchedule() {
  let seasons: number[] = [];
  try {
    seasons = await listWulSeasons();
  } catch (err) {
    console.error('WulSchedule: failed to fetch seasons', err);
  }
  if (seasons.length === 0) seasons = [WUL_CURRENT_SEASON];

  // Fetch each season's games in parallel; keep newest-first ordering.
  const perSeason = await Promise.all(
    seasons.map(async (season) => {
      try {
        const games = await listWulGames({ season });
        return { season, games };
      } catch (err) {
        console.error(`WulSchedule: failed to fetch ${season}`, err);
        return { season, games: [] as WulGame[] };
      }
    }),
  );

  const populated = perSeason.filter((s) => s.games.length > 0);

  if (populated.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border">
        <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
          No games yet
        </div>
        <div className="text-[13px] text-faint font-tight">
          WUL game history will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {populated.map(({ season, games }, i) => (
        <SeasonSection key={season} season={season} games={games} emphasized={i === 0} />
      ))}
    </div>
  );
}

// ── Season section ─────────────────────────────────────────────────────────────

function SeasonSection({
  season,
  games,
  emphasized,
}: {
  season: number;
  games: WulGame[];
  emphasized: boolean;
}) {
  const regular = games.filter((g) => g.weekLabel === 'regular');
  const post = games.filter((g) => g.weekLabel === 'post');
  // Derive Final / Semifinal / 3rd-place from this season's bracket structure.
  const rounds = deriveWulPostseasonRounds(games);

  const id = `wul-schedule-${season}`;
  return (
    <section aria-labelledby={id}>
      <div
        className={[
          'flex items-baseline justify-between gap-3 mb-4 pb-2 border-b',
          emphasized ? 'border-ink' : 'border-hairline',
        ].join(' ')}
      >
        <span
          id={id}
          className={[
            'text-[13px] font-bold tracking-[0.06em] uppercase font-tight',
            emphasized ? 'text-ink' : 'text-muted',
          ].join(' ')}
        >
          {season} Season
        </span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
          {games.length} {games.length === 1 ? 'game' : 'games'}
        </span>
      </div>

      <div className="flex flex-col gap-6">
        {regular.length > 0 && (
          <PhaseGroup label="Regular Season" games={regular} />
        )}
        {post.length > 0 && <PostseasonGroups games={post} rounds={rounds} />}
      </div>
    </section>
  );
}

function PhaseGroup({
  label,
  games,
  champion = false,
}: {
  label: string;
  games: WulGame[];
  champion?: boolean;
}) {
  return (
    <div>
      <div
        className={[
          'mb-2.5 text-[10px] font-bold tracking-[0.18em] uppercase font-tight',
          champion ? 'text-ink' : 'text-muted',
        ].join(' ')}
      >
        {label}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
        {games.map((game) => (
          <ScheduleCard key={game.id} game={game} champion={champion} />
        ))}
      </div>
    </div>
  );
}

// Split the postseason into Final / Semifinals / 3rd Place using the derived
// rounds. Anything unclassified falls back to a plain "Postseason" group.
function PostseasonGroups({
  games,
  rounds,
}: {
  games: WulGame[];
  rounds: Map<string, WulPostseasonRound>;
}) {
  const order: WulPostseasonRound[] = ['final', 'semifinal', 'third_place'];
  const labels: Record<WulPostseasonRound, string> = {
    final: 'Final',
    semifinal: 'Semifinals',
    third_place: '3rd Place',
  };
  const byRound = new Map<WulPostseasonRound, WulGame[]>();
  const unclassified: WulGame[] = [];
  for (const g of games) {
    const r = rounds.get(g.id);
    if (!r) {
      unclassified.push(g);
      continue;
    }
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(g);
  }

  return (
    <>
      {order
        .filter((r) => byRound.has(r))
        .map((r) => (
          <PhaseGroup
            key={r}
            label={labels[r]}
            games={byRound.get(r)!}
            champion={r === 'final'}
          />
        ))}
      {unclassified.length > 0 && (
        <PhaseGroup label="Postseason" games={unclassified} />
      )}
    </>
  );
}

// ── Schedule card ───────────────────────────────────────────────────────────────

function ScheduleCard({ game, champion = false }: { game: WulGame; champion?: boolean }) {
  const { away, home, status } = game;
  const isFinal = status === 'final';
  const awayWin =
    isFinal && away.score !== null && home.score !== null && away.score > home.score;
  const homeWin =
    isFinal && away.score !== null && home.score !== null && home.score > away.score;

  // For the championship game show a "Championship" marker instead of the
  // generic "Final" status word (which would read oddly next to the round label).
  const statusWord = champion ? 'Championship' : isFinal ? 'Final' : 'Scheduled';

  const inner = (
    <>
      <div className="flex items-center justify-between mb-2.5">
        <span
          className={[
            'flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] uppercase font-tight',
            champion ? 'text-accent' : isFinal ? 'text-muted' : 'text-accent',
          ].join(' ')}
        >
          {champion && <TrophyIcon />}
          {statusWord}
        </span>
        {game.gameDate && (
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-faint font-tight tabular">
            {formatDate(game.gameDate)}
          </span>
        )}
      </div>

      <ScheduleRow side={away} win={awayWin} lose={homeWin} showScore={isFinal} />
      <div className="h-px bg-hairline my-1" />
      <ScheduleRow side={home} win={homeWin} lose={awayWin} showScore={isFinal} />
    </>
  );

  const cardClass = [
    'block bg-surface border rounded-md',
    'px-4 py-3.5 md:px-5 md:py-4',
    'transition-colors duration-150',
    champion ? 'border-accent ring-1 ring-accent/40' : 'border-border',
  ].join(' ');

  // Final games are clickable into the matchup detail page.
  if (isFinal) {
    return (
      <Link
        href={`/wul/g/${wulGameHref(game.id)}`}
        className={`${cardClass} ${champion ? 'hover:border-accent' : 'hover:border-ink'} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}

function TrophyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 4h12v3a6 6 0 0 1-12 0V4Z M6 5H3v2a3 3 0 0 0 3 3 M18 5h3v2a3 3 0 0 1-3 3 M9 14.5h6 M10 18h4 M9 18h6v2H9z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Schedule row ────────────────────────────────────────────────────────────────

function ScheduleRow({
  side,
  win,
  lose,
  showScore,
}: {
  side: WulGameTeamSide;
  win: boolean;
  lose: boolean;
  showScore: boolean;
}) {
  const teamForLogo = {
    id: side.teamId,
    abbr: side.abbrev,
    logoUrl: side.logoUrl,
    accentColor: side.accentColor,
  };
  const label = [side.city, side.mascot].filter(Boolean).join(' ') || side.abbrev;

  return (
    <div
      className={[
        'flex items-center justify-between py-1.5',
        lose ? 'opacity-60' : 'opacity-100',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
        <WulTeamLogo team={teamForLogo} size={28} />
        <span
          className={[
            'font-tight tracking-[-0.01em] text-[15px] md:text-[17px] text-ink truncate',
            win ? 'font-bold' : 'font-medium',
          ].join(' ')}
        >
          {label}
        </span>
      </div>

      <span className="flex items-center gap-2 flex-shrink-0 ml-3">
        {win && showScore && (
          <span
            className="w-[5px] h-[5px] rounded-full bg-accent flex-shrink-0"
            aria-hidden="true"
          />
        )}
        <span
          className={[
            'tabular leading-none font-tight tracking-[-0.04em] text-[26px]',
            showScore ? (win ? 'font-bold text-ink' : 'font-medium text-muted') : 'font-medium text-faint',
          ].join(' ')}
        >
          {showScore ? (side.score ?? '–') : '–'}
        </span>
      </span>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Mirror wulGameHref from wul-scores: keep slashes as real path separators. */
function wulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
