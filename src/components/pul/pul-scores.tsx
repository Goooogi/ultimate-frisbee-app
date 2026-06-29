// PUL Scores — server component. Shows completed games grouped by week,
// most-recent week first (reverse chronological for a scores view).

import Link from 'next/link';
import { listPulGames, type PulGame, type PulGameTeamSide } from '@/lib/pul/data';
import { PulTeamLogo } from '@/components/pul-team-logo';

interface Props {
  season: number;
}

export async function PulScores({ season }: Props) {
  let games: PulGame[] = [];
  try {
    games = await listPulGames({ season, onlyFinal: true });
  } catch (err) {
    console.error('PulScores: failed to fetch games', err);
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
  const byWeek = new Map<string, PulGame[]>();
  for (const game of games) {
    if (!byWeek.has(game.weekLabel)) {
      groupOrder.push(game.weekLabel);
      byWeek.set(game.weekLabel, []);
    }
    byWeek.get(game.weekLabel)!.push(game);
  }

  // Reverse so most-recent week is rendered first.
  const orderedWeeks = [...groupOrder].reverse();

  return (
    <div className="flex flex-col gap-8">
      {orderedWeeks.map((weekLabel) => (
        <WeekSection
          key={weekLabel}
          weekLabel={weekLabel}
          games={byWeek.get(weekLabel)!}
          // Visually emphasize the most-recently completed week (first rendered).
          emphasized={weekLabel === orderedWeeks[0]}
        />
      ))}
    </div>
  );
}

// ── Week section ──────────────────────────────────────────────────────────────

function WeekSection({
  weekLabel,
  games,
  emphasized,
}: {
  weekLabel: string;
  games: PulGame[];
  emphasized: boolean;
}) {
  const id = `pul-scores-${weekLabel}`;
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 md:gap-3">
        {games.map((game) => (
          <ScoreCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
}

// ── Score card ────────────────────────────────────────────────────────────────

function ScoreCard({ game }: { game: PulGame }) {
  const { away, home } = game;
  const awayWin =
    away.score !== null && home.score !== null && away.score > home.score;
  const homeWin =
    away.score !== null && home.score !== null && home.score > away.score;

  const cardClass = [
    'block bg-surface border border-border rounded-md',
    'px-4 py-3.5 md:px-5 md:py-4',
    'transition-colors duration-150',
  ].join(' ');

  const inner = (
    <>
      {/* Date + location sub-line */}
      {(game.gameDate || game.location) && (
        <div className="flex items-center gap-2 mb-2.5 text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
          {game.gameDate && (
            <span className="tabular">{formatDate(game.gameDate)}</span>
          )}
          {game.gameDate && game.location && (
            <span className="text-faint" aria-hidden="true">·</span>
          )}
          {game.location && (
            <span className="truncate">{game.location}</span>
          )}
        </div>
      )}

      {/* Away row */}
      <ScoreRow side={away} win={awayWin} lose={homeWin} />

      <div className="h-px bg-hairline my-1" />

      {/* Home row */}
      <ScoreRow side={home} win={homeWin} lose={awayWin} />
    </>
  );

  // Final games are clickable into the matchup detail page. Scheduled games
  // have no box score yet, so they render as a static card.
  if (game.status === 'final') {
    return (
      <Link
        href={`/pul/g/${pulGameHref(game.id)}`}
        className={`${cardClass} hover:border-ink cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {inner}
      </Link>
    );
  }
  return <div className={cardClass}>{inner}</div>;
}

// ── Score row ─────────────────────────────────────────────────────────────────

function ScoreRow({
  side,
  win,
  lose,
}: {
  side: PulGameTeamSide;
  win: boolean;
  lose: boolean;
}) {
  // Build a PulTeam-compatible object for PulTeamLogo.
  // PulTeamLogo needs: { id, mascot, logoUrl }.
  // PulGameTeamSide has teamId, mascot, logoUrl.
  const teamForLogo = {
    id: side.teamId,
    mascot: side.mascot ?? side.abbrev,
    logoUrl: side.logoUrl,
    // PulTeamLogo only uses id, mascot, logoUrl — remaining fields are unused.
    name: side.mascot ?? side.abbrev,
    city: side.city ?? '',
    accentColor: null,
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
        <PulTeamLogo team={teamForLogo} size={28} />
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
  if (label === 'semifinals') return 'Semifinals';
  if (label === 'finals') return 'Finals';
  const n = parseInt(label.replace(/\D/g, ''), 10);
  if (!isNaN(n)) return `Week ${n}`;
  // Fallback: title-case the slug.
  return label
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDate(iso: string): string {
  // iso is 'yyyy-mm-dd'
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Build the href path for a PUL game id like "2026/finals/PHL-vs-DC".
 *  The /pul/g/[...id] route is a catch-all, so we keep the slashes as REAL
 *  path separators (encoding each segment individually) rather than
 *  %2F-encoding the whole id into one segment — %2F in a single segment is
 *  brittle across Next/Vercel normalization. The catch-all then receives the
 *  segments array and rejoins it. */
function pulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
