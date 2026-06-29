// WUL Scores — server component. Shows completed games grouped by week,
// most-recent week first (reverse chronological for a scores view).
// Mirrors src/components/pul/pul-scores.tsx exactly, adapted for WUL types.
//
// Key WUL differences vs PUL:
//   • weekLabel is 'regular' | 'post' (not 'week-N' | 'semifinals' | 'finals')
//   • WulGame has no gameTime or location fields.
//   • WulGameTeamSide carries accentColor directly.
//   • WulTeamLogo (wul-team-logo.tsx) accepts WulTeam; we build a compatible shape.

import Link from 'next/link';
import {
  listWulGames,
  deriveWulPostseasonRounds,
  type WulGame,
  type WulGameTeamSide,
  type WulPostseasonRound,
} from '@/lib/wul/data';
import { WulTeamLogo } from '@/components/wul-team-logo';

interface Props {
  season: number;
}

export async function WulScores({ season }: Props) {
  let games: WulGame[] = [];
  try {
    games = await listWulGames({ season, onlyFinal: true });
  } catch (err) {
    console.error('WulScores: failed to fetch games', err);
    return (
      <div className="text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2">
        Could not load scores. Please try again.
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border">
        <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
          No completed games yet
        </div>
        <div className="text-[13px] text-faint font-tight">
          No completed games yet for {season}.
        </div>
      </div>
    );
  }

  // Group by weekLabel, preserving the chronological order from the data layer
  // so we can reverse the group order (most recent first for scores).
  const groupOrder: string[] = [];
  const byWeek = new Map<string, WulGame[]>();
  for (const game of games) {
    if (!byWeek.has(game.weekLabel)) {
      groupOrder.push(game.weekLabel);
      byWeek.set(game.weekLabel, []);
    }
    byWeek.get(game.weekLabel)!.push(game);
  }

  // Reverse so most-recent week is rendered first.
  const orderedWeeks = [...groupOrder].reverse();

  // Derive Final / Semifinal / 3rd-place for the postseason games (the source
  // tags them all as 'post'; the round is inferred from the bracket structure).
  const rounds = deriveWulPostseasonRounds(games);

  return (
    <div className="flex flex-col gap-8">
      {orderedWeeks.map((weekLabel) => (
        <WeekSection
          key={weekLabel}
          weekLabel={weekLabel}
          games={byWeek.get(weekLabel)!}
          rounds={rounds}
          emphasized={weekLabel === orderedWeeks[0]}
        />
      ))}
    </div>
  );
}

// Order + display labels for the derived postseason rounds (final first).
const POST_ROUND_ORDER: WulPostseasonRound[] = ['final', 'semifinal', 'third_place'];
const POST_ROUND_LABEL: Record<WulPostseasonRound, string> = {
  final: 'Final',
  semifinal: 'Semifinals',
  third_place: '3rd Place',
};

// ── Week section ──────────────────────────────────────────────────────────────

function WeekSection({
  weekLabel,
  games,
  rounds,
  emphasized,
}: {
  weekLabel: string;
  games: WulGame[];
  rounds: Map<string, WulPostseasonRound>;
  emphasized: boolean;
}) {
  const id = `wul-scores-${weekLabel}`;
  const label = formatWeekLabel(weekLabel);

  return (
    <section aria-labelledby={id}>
      <div
        className={[
          'flex items-baseline justify-between gap-3 mb-3 pb-2 border-b',
          emphasized ? 'border-ink' : 'border-hairline',
        ].join(' ')}
      >
        <span
          id={id}
          className={[
            'text-[10px] font-bold tracking-[0.18em] uppercase font-tight',
            emphasized ? 'text-ink' : 'text-muted',
          ].join(' ')}
        >
          {label}
        </span>
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
          {games.length} {games.length === 1 ? 'game' : 'games'}
        </span>
      </div>

      {weekLabel === 'post' ? (
        <PostseasonRounds games={games} rounds={rounds} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
          {games.map((game) => (
            <ScoreCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </section>
  );
}

// Postseason sub-grouping: Final (with championship emphasis), then Semifinals,
// then 3rd Place. Falls back to a flat grid for any games we couldn't classify.
function PostseasonRounds({
  games,
  rounds,
}: {
  games: WulGame[];
  rounds: Map<string, WulPostseasonRound>;
}) {
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
    <div className="flex flex-col gap-5">
      {POST_ROUND_ORDER.filter((r) => byRound.has(r)).map((round) => (
        <div key={round}>
          <div
            className={[
              'mb-2.5 text-[10px] font-bold tracking-[0.18em] uppercase font-tight',
              round === 'final' ? 'text-ink' : 'text-muted',
            ].join(' ')}
          >
            {POST_ROUND_LABEL[round]}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
            {byRound.get(round)!.map((game) => (
              <ScoreCard key={game.id} game={game} champion={round === 'final'} />
            ))}
          </div>
        </div>
      ))}
      {unclassified.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
          {unclassified.map((game) => (
            <ScoreCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Score card ────────────────────────────────────────────────────────────────

function ScoreCard({ game, champion = false }: { game: WulGame; champion?: boolean }) {
  const { away, home } = game;
  const awayWin =
    away.score !== null && home.score !== null && away.score > home.score;
  const homeWin =
    away.score !== null && home.score !== null && home.score > away.score;

  // Championship game gets a subtle accent ring to stand out from the rest.
  const cardClass = [
    'block bg-surface border rounded-md',
    'px-4 py-3.5 md:px-5 md:py-4',
    'transition-colors duration-150',
    champion ? 'border-accent ring-1 ring-accent/40' : 'border-border',
  ].join(' ');

  const inner = (
    <>
      {/* Championship marker — only on the derived final. */}
      {champion && (
        <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold tracking-[0.16em] uppercase text-accent font-tight">
          <TrophyIcon />
          <span>Championship</span>
        </div>
      )}

      {/* Date sub-line (WUL has no location/time in data) */}
      {game.gameDate && (
        <div className="flex items-center gap-2 mb-2.5 text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
          <span className="tabular">{formatDate(game.gameDate)}</span>
        </div>
      )}

      {/* Away row */}
      <ScoreRow side={away} win={awayWin} lose={homeWin} />

      <div className="h-px bg-hairline my-1" />

      {/* Home row */}
      <ScoreRow side={home} win={homeWin} lose={awayWin} />
    </>
  );

  // Final games are clickable into the matchup detail page.
  if (game.status === 'final') {
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

// ── Score row ─────────────────────────────────────────────────────────────────

function ScoreRow({
  side,
  win,
  lose,
}: {
  side: WulGameTeamSide;
  win: boolean;
  lose: boolean;
}) {
  // Build a WulTeamLogo-compatible shape from WulGameTeamSide.
  // WulTeamLogo needs: { id, abbr, logoUrl, accentColor }.
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
      {/* Logo + team name */}
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

      {/* Score */}
      <span className="flex items-center gap-2 flex-shrink-0 ml-3">
        {win && (
          <span
            className="w-[5px] h-[5px] rounded-full bg-accent flex-shrink-0"
            aria-hidden="true"
          />
        )}
        <span
          className={[
            'tabular leading-none font-tight tracking-[-0.04em] text-[26px]',
            win ? 'font-bold text-ink' : 'font-medium text-muted',
          ].join(' ')}
        >
          {side.score ?? '–'}
        </span>
      </span>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatWeekLabel(label: string): string {
  if (label === 'regular') return 'Regular Season';
  if (label === 'post') return 'Postseason';
  // Fallback: title-case the slug.
  return label
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Build the href path for a WUL game id like "2026/2026-06-14/SD-vs-SEA".
 *  The /wul/g/[...id] route is a catch-all, so we keep the slashes as REAL
 *  path separators (encoding each segment individually) — mirrors pulGameHref. */
function wulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
