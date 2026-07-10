// PUL Schedule — server component. Shows all games grouped by week,
// chronological (earliest week first). Final games show the score;
// scheduled games show the time or "Scheduled".

import { listPulGames, type PulGame, type PulGameTeamSide } from '@/lib/pul/data';
import { PulTeamLogo } from '@/components/pul-team-logo';

interface Props {
  season: number;
}

export async function PulSchedule({ season }: Props) {
  let games: PulGame[] = [];
  try {
    games = await listPulGames({ season });
  } catch (err) {
    console.error('PulSchedule: failed to fetch games', err);
    return (
      <div className="text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2">
        Could not load schedule. Please try again.
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface rounded-card-lg shadow-card">
        <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted mb-2 font-tight">
          No games scheduled
        </div>
        <div className="text-[13px] text-faint font-tight">
          No games scheduled for {season} yet.
        </div>
      </div>
    );
  }

  // Group by weekLabel in the order they naturally appear (date asc from data
  // layer, so groupOrder is already chronological).
  const groupOrder: string[] = [];
  const byWeek = new Map<string, PulGame[]>();
  for (const game of games) {
    if (!byWeek.has(game.weekLabel)) {
      groupOrder.push(game.weekLabel);
      byWeek.set(game.weekLabel, []);
    }
    byWeek.get(game.weekLabel)!.push(game);
  }

  return (
    <div className="flex flex-col gap-8">
      {groupOrder.map((weekLabel, i) => (
        <WeekSection
          key={weekLabel}
          weekLabel={weekLabel}
          games={byWeek.get(weekLabel)!}
          // Visually emphasize the first (earliest / current) week.
          emphasized={i === 0}
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
  const id = `pul-schedule-${weekLabel}`;
  const label = formatWeekLabel(weekLabel);

  return (
    <section aria-labelledby={id}>
      <div className="flex items-end justify-between gap-3 mb-4">
        <span
          id={id}
          className={[
            'font-display italic font-bold text-[22px] lg:text-[26px] leading-[0.95] tracking-[-0.02em]',
            emphasized ? 'text-ink' : 'text-muted',
          ].join(' ')}
        >
          {label}
        </span>
        <span className="text-[10.5px] font-bold tracking-[0.16em] uppercase text-faint pb-1">
          {games.length} {games.length === 1 ? 'game' : 'games'}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {games.map((game) => (
          <ScheduleCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
}

// ── Schedule card ─────────────────────────────────────────────────────────────

function ScheduleCard({ game }: { game: PulGame }) {
  const { away, home, status } = game;
  const isFinal = status === 'final';
  const awayWin =
    isFinal && away.score !== null && home.score !== null && away.score > home.score;
  const homeWin =
    isFinal && away.score !== null && home.score !== null && home.score > away.score;

  return (
    <div className="bg-surface rounded-card shadow-card hover:shadow-lift transition-shadow px-4 py-3.5 md:px-5 md:py-4">
      {/* Status / date row */}
      <div className="flex items-center justify-between mb-2.5">
        <span
          className={[
            'text-[10px] font-bold tracking-[0.14em] uppercase font-tight',
            isFinal ? 'text-muted' : 'text-accent',
          ].join(' ')}
        >
          {isFinal ? 'Final' : 'Scheduled'}
        </span>
        <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-faint font-tight tabular">
          {formatDateMeta(game.gameDate, game.gameTime, isFinal)}
        </span>
      </div>

      {/* Away row */}
      <ScheduleRow
        side={away}
        win={awayWin}
        lose={homeWin}
        showScore={isFinal}
      />

      <div className="h-px bg-hairline my-1" />

      {/* Home row */}
      <ScheduleRow
        side={home}
        win={homeWin}
        lose={awayWin}
        showScore={isFinal}
      />

      {/* Location sub-line */}
      {game.location && (
        <div className="mt-2 text-[10px] font-semibold tracking-[0.08em] uppercase text-faint font-tight truncate">
          {game.location}
        </div>
      )}
    </div>
  );
}

// ── Schedule row ──────────────────────────────────────────────────────────────

function ScheduleRow({
  side,
  win,
  lose,
  showScore,
}: {
  side: PulGameTeamSide;
  win: boolean;
  lose: boolean;
  showScore: boolean;
}) {
  const teamForLogo = {
    id: side.teamId,
    mascot: side.mascot ?? side.abbrev,
    logoUrl: side.logoUrl,
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
      {/* Logo + name */}
      <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <PulTeamLogo team={teamForLogo} size={28} />
        </span>
        <span
          className={[
            'font-tight tracking-[-0.01em] text-[15px] md:text-[17px] text-ink truncate',
            win ? 'font-bold' : 'font-medium',
          ].join(' ')}
        >
          {label}
        </span>
      </div>

      {/* Score or dash */}
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
            showScore
              ? win
                ? 'font-bold text-ink'
                : 'font-medium text-muted'
              : 'font-medium text-faint',
          ].join(' ')}
        >
          {showScore ? (side.score ?? '–') : '–'}
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
  return label
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatDateMeta(
  date: string | null,
  time: string | null,
  isFinal: boolean,
): string {
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (!isFinal && time) return `${dateStr} · ${formatTime(time)}`;
  return dateStr;
}

function formatTime(time: string): string {
  // time is 'HH:MM' or 'HH:MM:SS' (24h)
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}
