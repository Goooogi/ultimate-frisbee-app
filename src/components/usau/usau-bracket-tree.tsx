'use client';

// Tournament bracket tree visualization for USAU events.
//
// Takes the flat list of championship-bracket games we have and derives a
// left-to-right tree:
//   R1 (8 games) → QFs (8) → SFs (4) → Final (2 — one per gender)
//
// The parser stores Friday R1 + Saturday QFs both as round='quarter'. We
// split them by scheduled date: earliest-date quarters = R1, later = QFs.
//
// Gender toggle appears when the event has both Men's and Women's teams
// (College Championships, Club Nationals). Each gender has its own bracket
// since the formats are independent.
//
// Layout:
//   - Desktop (lg+): horizontal columns per round, hairline connector lines
//     between match cards.
//   - Mobile (<lg): stack vertically by round with section headers.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { UsauEventSummary } from '@/lib/usau/data';

type Game = UsauEventSummary['games'][number];
type Team = UsauEventSummary['teams'][number];

interface Props {
  event: UsauEventSummary;
}

interface RoundColumn {
  /** Display label for this column. */
  label: string;
  /** Stable key. */
  key: 'r1' | 'qf' | 'sf' | 'final';
  games: Game[];
}

export function UsauBracketTree({ event }: Props) {
  // ── Pull championship-bracket games only ───────────────────────────────
  const champGames = useMemo(
    () => event.games.filter((g) => isChampionshipBracket(g)),
    [event.games],
  );

  // ── Detect available genders + default selection ───────────────────────
  const teamGender = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const t of event.teams) m.set(t.teamId, t.genderDivision);
    return m;
  }, [event.teams]);

  const availableGenders = useMemo(() => {
    const set = new Set<string>();
    for (const g of champGames) {
      const a = teamGender.get(g.teamAId ?? '') ?? null;
      const b = teamGender.get(g.teamBId ?? '') ?? null;
      if (a) set.add(a);
      if (b) set.add(b);
    }
    return Array.from(set);
  }, [champGames, teamGender]);

  const [gender, setGender] = useState<string>(() => {
    // Prefer Men first if multiple exist (matches the existing semis order).
    if (availableGenders.includes('Men')) return 'Men';
    if (availableGenders.includes('Women')) return 'Women';
    return availableGenders[0] ?? '';
  });

  // ── Filter to the selected gender ──────────────────────────────────────
  const genderGames = useMemo(() => {
    if (!gender) return champGames;
    return champGames.filter((g) => {
      const a = teamGender.get(g.teamAId ?? '');
      const b = teamGender.get(g.teamBId ?? '');
      return a === gender || b === gender;
    });
  }, [champGames, gender, teamGender]);

  // ── Split into round columns ───────────────────────────────────────────
  const columns = useMemo(() => buildColumns(genderGames), [genderGames]);

  if (columns.every((c) => c.games.length === 0)) {
    return null;
  }

  return (
    <section className="mb-10" aria-labelledby="bracket-heading">
      <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
        <h2
          id="bracket-heading"
          className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight"
        >
          Championship bracket
        </h2>
        {availableGenders.length > 1 && (
          <GenderToggle
            value={gender}
            options={availableGenders}
            onChange={setGender}
          />
        )}
      </div>

      {/* Mobile: vertical stack by round */}
      <div className="lg:hidden flex flex-col gap-5">
        {columns.map(
          (col) =>
            col.games.length > 0 && (
              <div key={col.key}>
                <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-2">
                  {col.label}
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {col.games.map((g) => (
                    <MatchCard key={g.id} game={g} compact />
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>

      {/* Desktop: horizontal columns, hairline connectors */}
      <div className="hidden lg:block overflow-x-auto pb-2">
        <div
          className="grid gap-x-8 min-w-[920px]"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(180px, 1fr))`,
          }}
        >
          {columns.map((col) => (
            <div key={col.key} className="flex flex-col">
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-faint font-tight mb-3 text-center">
                {col.label}
              </div>
              <BracketColumn games={col.games} columnKey={col.key} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Column layout (desktop) ───────────────────────────────────────────────

function BracketColumn({
  games,
  columnKey,
}: {
  games: Game[];
  columnKey: RoundColumn['key'];
}) {
  // Each round has progressively fewer games. We grow vertical spacing
  // exponentially so matches in later rounds align with the midpoint
  // between their two source matches in the prior column.
  const spacingByCol: Record<RoundColumn['key'], string> = {
    r1: 'gap-2',
    qf: 'gap-12',
    sf: 'gap-32',
    final: 'gap-32',
  };
  const paddingTopByCol: Record<RoundColumn['key'], string> = {
    r1: 'pt-0',
    qf: 'pt-7',
    sf: 'pt-[88px]',
    final: 'pt-[152px]',
  };

  return (
    <div className={`flex flex-col ${spacingByCol[columnKey]} ${paddingTopByCol[columnKey]}`}>
      {games.map((g) => (
        <MatchCard key={g.id} game={g} />
      ))}
    </div>
  );
}

// ── Match card ────────────────────────────────────────────────────────────

function MatchCard({ game, compact = false }: { game: Game; compact?: boolean }) {
  const aWon =
    game.scoreA != null && game.scoreB != null && game.scoreA > game.scoreB;
  const bWon =
    game.scoreA != null && game.scoreB != null && game.scoreB > game.scoreA;
  const tone = matchTone(game);

  return (
    <article
      className={[
        'bg-surface border rounded-md overflow-hidden',
        tone === 'live'
          ? 'border-accent shadow-[0_0_0_3px_rgba(255,61,0,0.08)]'
          : 'border-border',
      ].join(' ')}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline">
        <StatusPill tone={tone} label={statusLabel(game)} />
        <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-faint font-tight tabular">
          {gameTime(game)}
        </span>
      </div>
      <TeamLine
        teamId={game.teamAId}
        name={game.teamAName}
        seed={game.seedA}
        score={game.scoreA}
        won={aWon}
        lost={bWon}
        compact={compact}
      />
      <div className="h-px bg-hairline" />
      <TeamLine
        teamId={game.teamBId}
        name={game.teamBName}
        seed={game.seedB}
        score={game.scoreB}
        won={bWon}
        lost={aWon}
        compact={compact}
      />
    </article>
  );
}

function TeamLine({
  teamId,
  name,
  seed,
  score,
  won,
  lost,
  compact,
}: {
  teamId: string | null;
  name: string | null;
  seed: number | null;
  score: number | null;
  won: boolean;
  lost: boolean;
  compact?: boolean;
}) {
  const labelColor = won ? 'text-ink' : lost ? 'text-faint' : 'text-muted';
  const scoreColor = won ? 'text-accent' : lost ? 'text-faint' : 'text-muted';
  const fontWeight = won ? 'font-bold' : 'font-semibold';

  const inner = (
    <span className={`flex items-center gap-2 flex-1 min-w-0 ${labelColor}`}>
      {seed != null && (
        <span className="tabular text-[10px] text-faint font-bold w-4 text-right shrink-0">
          {seed}
        </span>
      )}
      <span className={`text-[13px] font-tight truncate ${fontWeight}`}>
        {name ?? 'TBD'}
      </span>
    </span>
  );

  return (
    <div className={`flex items-center gap-3 px-3 ${compact ? 'py-1.5' : 'py-2'}`}>
      {teamId ? (
        <Link
          href={`/usau/teams/${teamId}`}
          className="flex-1 min-w-0 hover:opacity-80 transition-opacity no-underline"
        >
          {inner}
        </Link>
      ) : (
        <span className="flex-1 min-w-0">{inner}</span>
      )}
      <span
        className={`tabular text-[15px] font-bold font-tight leading-none w-7 text-right ${scoreColor}`}
      >
        {score ?? '–'}
      </span>
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────

type Tone = 'final' | 'live' | 'upcoming' | 'tbd';

function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const toneClass = {
    final: 'text-faint',
    live: 'text-accent',
    upcoming: 'text-muted',
    tbd: 'text-faint',
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.16em] uppercase font-tight ${toneClass}`}
    >
      {tone === 'live' && (
        <span className="w-[6px] h-[6px] rounded-full bg-accent animate-pulse" aria-hidden />
      )}
      {label}
    </span>
  );
}

function matchTone(game: Game): Tone {
  if (game.status === 'in_progress') return 'live';
  if (game.status === 'final') return 'final';
  if (!game.teamAName && !game.teamBName) return 'tbd';
  return 'upcoming';
}

function statusLabel(game: Game): string {
  if (game.status === 'in_progress') return 'Live';
  if (game.status === 'final') return 'Final';
  if (!game.teamAName && !game.teamBName) return 'TBD';
  return 'Upcoming';
}

function gameTime(game: Game): string {
  if (!game.scheduledAt) return '';
  const d = new Date(game.scheduledAt);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

// ── Gender toggle ────────────────────────────────────────────────────────

function GenderToggle({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-full bg-surface border border-border p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={[
            'inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.16em] uppercase font-tight transition-colors cursor-pointer',
            value === opt
              ? 'bg-ink text-bg'
              : 'text-muted hover:text-ink',
          ].join(' ')}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── Helpers: filter + column build ───────────────────────────────────────

function isChampionshipBracket(g: Game): boolean {
  // Championship bracket = 1st place games (not placement / consolation /
  // pool / 13th-place etc.). We treat the canonical bracket_name='1st Place'
  // as the championship bracket marker.
  const b = (g.bracketName ?? '').toLowerCase();
  if (b.includes('1st place')) return true;
  // Fallback: if no bracket names at all, accept anything in (quarter, semi, final)
  if (!g.bracketName && ['quarter', 'semi', 'final'].includes(g.round)) return true;
  return false;
}

function buildColumns(games: Game[]): RoundColumn[] {
  // Split round='quarter' into R1 (earlier date) vs QF (later date).
  const quarters = games.filter((g) => g.round === 'quarter');
  const semis = games.filter((g) => g.round === 'semi');
  const finals = games.filter((g) => g.round === 'final');

  // Distinct quarter dates → assume earliest dates = R1, later = QF.
  // If there's only one set of quarters, treat them as QFs (no R1 column).
  const quarterDates = Array.from(
    new Set(
      quarters
        .map((g) => g.scheduledAt?.slice(0, 10))
        .filter((d): d is string => !!d),
    ),
  ).sort();

  let r1: Game[] = [];
  let qf: Game[] = quarters;
  if (quarterDates.length >= 2) {
    const earliest = quarterDates[0];
    r1 = quarters.filter((g) => g.scheduledAt?.slice(0, 10) === earliest);
    qf = quarters.filter((g) => g.scheduledAt?.slice(0, 10) !== earliest);
  }

  // Sort each column by scheduled time, then by seed (so brackets read top→bottom)
  const sortByTimeThenSeed = (a: Game, b: Game) => {
    const at = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
    const bt = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
    if (at !== bt) return at - bt;
    return (a.seedA ?? 99) - (b.seedA ?? 99);
  };

  return [
    { key: 'r1', label: 'Round 1', games: r1.sort(sortByTimeThenSeed) },
    { key: 'qf', label: 'Quarterfinals', games: qf.sort(sortByTimeThenSeed) },
    { key: 'sf', label: 'Semifinals', games: semis.sort(sortByTimeThenSeed) },
    { key: 'final', label: 'Final', games: finals.sort(sortByTimeThenSeed) },
  ];
}
