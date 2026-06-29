'use client';

// PUL game-detail component — mirrors the visual language of UFA's GameDetail:
// AppShell wrapper, Breadcrumbs + eyebrow, status strip, dramatic two-half
// ScoreBlock, team totals comparison bars, and per-player box score tables.
//
// Color: PulGameTeamSide doesn't carry accentColor, so we fall back to '#888'
// for gradient tints and comparison bars. The stencil abbr uses the same neutral
// stroke, keeping it tasteful when no brand color is available.

import Link from 'next/link';
import { AppShell } from '@/components/page-shell';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PulTeamLogo } from '@/components/pul-team-logo';
import type { PulGame, PulGameBoxscore, PulBoxscoreRow, PulGameTeamSide } from '@/lib/pul/data';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PulGameDetailProps {
  game: PulGame;
  boxscore: PulGameBoxscore;
}

// ── Adapter: PulGameTeamSide → minimal PulTeam shape for PulTeamLogo ─────────
// PulTeamLogo expects a PulTeam (which has .mascot as a non-null string,
// accentColor, etc.). We construct a compatible shape from the side data.
// accentColor is unavailable on the side, so we pass null — the logo will
// render a monogram tile for teams without a logoUrl regardless.

type LogoCompatTeam = {
  id: string;
  name: string;
  city: string;
  mascot: string;
  logoUrl: string | null;
  accentColor: string | null;
};

function sideToLogoTeam(side: PulGameTeamSide): LogoCompatTeam {
  return {
    id: side.teamId,
    name: [side.city, side.mascot].filter(Boolean).join(' ') || side.abbrev,
    city: side.city ?? side.abbrev,
    mascot: side.mascot ?? side.abbrev,
    logoUrl: side.logoUrl,
    accentColor: null,
  };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Format a PUL weekLabel for display: "week-7" → "WEEK 7", "finals" → "FINALS". */
function formatWeekLabel(label: string): string {
  return label.replace(/-/g, ' ').toUpperCase();
}

/** Format an ISO date string (yyyy-mm-dd) as "Jun 28, 2026". */
function formatGameDate(iso: string): string {
  // Parse manually to avoid UTC/local shift (the date string has no time zone).
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format +/- with explicit sign: 3 → "+3", -2 → "-2", 0 → "0". */
function formatPlusMinus(val: number): string {
  if (val > 0) return `+${val}`;
  return String(val);
}

// ── Neutral fallback color when accentColor is unavailable ────────────────────
const NEUTRAL_COLOR = '#6b7280';

// ── Root component ────────────────────────────────────────────────────────────

export function PulGameDetail({ game, boxscore }: PulGameDetailProps) {
  return (
    <AppShell>
      <DetailBody game={game} boxscore={boxscore} />
    </AppShell>
  );
}

// ── Detail body ───────────────────────────────────────────────────────────────

function DetailBody({ game, boxscore }: PulGameDetailProps) {
  const { away, home } = game;
  const isFinal = game.status === 'final';

  const awayDisplayName = [away.city, away.mascot].filter(Boolean).join(' ') || away.abbrev;
  const homeDisplayName = [home.city, home.mascot].filter(Boolean).join(' ') || home.abbrev;
  const matchupLabel = `${awayDisplayName} vs ${homeDisplayName}`;

  const awayWin = isFinal && away.score != null && home.score != null && away.score > home.score;
  const homeWin = isFinal && away.score != null && home.score != null && home.score > away.score;

  const hasBoxscore = boxscore.away.length > 0 || boxscore.home.length > 0;

  // Build team totals from the box score rows for the comparison section.
  const awayTotals = sumTotals(boxscore.away);
  const homeTotals = sumTotals(boxscore.home);

  return (
    <div className="bg-surface flex flex-col font-tight text-ink">

      {/* ── Breadcrumbs + eyebrow ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 md:px-14 md:py-5 flex-shrink-0">
        <Breadcrumbs
          crumbs={[
            { label: 'Home', href: '/' },
            { label: 'Scores', href: '/scores' },
            { label: matchupLabel },
          ]}
        />
        <span className="text-[10px] font-bold tracking-[0.18em] text-faint uppercase flex-shrink-0">
          PUL · {formatWeekLabel(game.weekLabel)}
        </span>
      </div>

      {/* ── Status strip ─────────────────────────────────────────────────── */}
      <StatusStrip game={game} isFinal={isFinal} />

      {/* ── Score block ──────────────────────────────────────────────────── */}
      <ScoreBlock
        away={away}
        home={home}
        awayWin={awayWin}
        homeWin={homeWin}
        showScore={isFinal}
      />

      {/* ── Team totals comparison (only when box score data is present) ── */}
      {hasBoxscore && (
        <TeamTotalsComparison
          away={away}
          home={home}
          awayTotals={awayTotals}
          homeTotals={homeTotals}
        />
      )}

      {/* ── Player box scores ─────────────────────────────────────────────── */}
      {hasBoxscore && (
        <BoxscoreSection
          away={away}
          home={home}
          awayRows={boxscore.away}
          homeRows={boxscore.home}
        />
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 pt-3.5 pb-6 md:px-14 md:py-5 border-t border-hairline text-muted">
        <span className="text-[11px] font-semibold tracking-[0.06em]">
          PUL · {game.season}
        </span>
        <span className="text-[11px] font-semibold tracking-[0.06em] tabular">
          {game.gameDate ? formatGameDate(game.gameDate) : formatWeekLabel(game.weekLabel)}
        </span>
      </div>
    </div>
  );
}

// ── Status strip ──────────────────────────────────────────────────────────────
// One tight row: status pill on the left, date + location meta on the right.
// Mirrors the UFA status strip — no giant "FINAL" repeated above the score block.

function StatusStrip({ game, isFinal }: { game: PulGame; isFinal: boolean }) {
  return (
    <div className="px-6 py-4 md:px-14 md:py-5 border-b border-hairline flex-shrink-0">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <span
          className={`text-[13px] font-bold tracking-[0.18em] uppercase ${
            isFinal ? 'text-ink' : 'text-muted'
          }`}
        >
          {isFinal ? 'Final' : 'Upcoming'}
        </span>
        {!isFinal && game.gameDate && (
          <span className="text-[20px] md:text-[28px] font-bold tracking-[-0.03em] text-ink tabular leading-none">
            {formatGameDate(game.gameDate)}
            {game.gameTime ? ` · ${game.gameTime}` : ''}
          </span>
        )}
      </div>
      {(game.location || game.gameDate) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-[11px] font-semibold tracking-[0.06em] text-muted">
          {isFinal && game.gameDate && (
            <span>{formatGameDate(game.gameDate)}</span>
          )}
          {game.location && (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true">@</span>
              {game.location}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Score block ───────────────────────────────────────────────────────────────
// Dramatic two-half split: stencil abbr backdrop + tinted gradient from top.
// Uses team color from accentColor if available; falls back to NEUTRAL_COLOR.

interface ScoreBlockProps {
  away: PulGameTeamSide;
  home: PulGameTeamSide;
  awayWin: boolean;
  homeWin: boolean;
  showScore: boolean;
}

function ScoreBlock({ away, home, awayWin, homeWin, showScore }: ScoreBlockProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 flex-1">
      <ScoreHalf
        side={away}
        label="Away"
        win={awayWin}
        showScore={showScore}
      />
      <ScoreHalf
        side={home}
        label="Home"
        win={homeWin}
        showScore={showScore}
        bordered
      />
    </div>
  );
}

function ScoreHalf({
  side,
  label,
  win,
  showScore,
  bordered,
}: {
  side: PulGameTeamSide;
  label: 'Away' | 'Home';
  win: boolean;
  showScore: boolean;
  bordered?: boolean;
}) {
  const logoTeam = sideToLogoTeam(side);
  // Real team brand color when available (now carried on the game side), with
  // a neutral fallback for any team missing an accent color.
  const teamColor = side.accentColor ?? NEUTRAL_COLOR;

  return (
    <div
      className={[
        'relative overflow-hidden bg-surface flex flex-col justify-between gap-5',
        'px-6 py-7 md:px-12 md:py-10 min-h-[260px] md:min-h-[320px]',
        bordered ? 'border-t md:border-t-0 md:border-l border-border' : '',
      ].join(' ')}
    >
      {/* Tinted gradient from top — uses team color at low opacity */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, ${teamColor}33, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* Stencil abbr — outlined text floats behind the score */}
      <div
        className="absolute font-display font-bold leading-none pointer-events-none select-none"
        style={{
          bottom: -30,
          right: -10,
          fontSize: 'clamp(110px, 18vw, 240px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'transparent',
          WebkitTextStroke: `1px ${teamColor}`,
          opacity: 0.45,
        }}
        aria-hidden="true"
      >
        {side.abbrev}
      </div>

      {/* Identity row: logo + Away/Home label + city + mascot */}
      <div className="relative flex items-center gap-4 min-w-0">
        <PulTeamLogo team={logoTeam} size={64} />
        <div className="min-w-0">
          <div className="font-sans text-[10px] font-bold tracking-[0.22em] uppercase text-muted">
            {label} · {side.abbrev}
          </div>
          {side.city && (
            <div className="font-sans text-[12px] md:text-[14px] text-muted font-medium truncate">
              {side.city}
            </div>
          )}
          <div className="font-display text-[28px] md:text-[44px] font-bold text-ink tracking-[0.01em] leading-none uppercase truncate">
            {side.mascot ?? side.abbrev}
          </div>
        </div>
      </div>

      {/* Big score */}
      <span
        className="relative font-display font-bold tabular leading-[0.85] tracking-[-0.04em]"
        style={{
          fontSize: 'clamp(80px, 12vw, 168px)',
          color: showScore
            ? win
              ? 'rgb(var(--accent))'
              : 'rgb(var(--ink))'
            : 'rgb(var(--faint))',
        }}
      >
        {showScore && side.score != null ? side.score : '–'}
      </span>
    </div>
  );
}

// ── Team totals ───────────────────────────────────────────────────────────────
// Summed from box score rows. Goals, Assists, Blocks, Turnovers, Touches.

interface Totals {
  goals: number;
  assists: number;
  blocks: number;
  turnovers: number;
  touches: number;
}

function sumTotals(rows: PulBoxscoreRow[]): Totals {
  return rows.reduce(
    (acc, r) => ({
      goals: acc.goals + r.goals,
      assists: acc.assists + r.assists,
      blocks: acc.blocks + r.blocks,
      turnovers: acc.turnovers + r.turnovers,
      touches: acc.touches + r.touches,
    }),
    { goals: 0, assists: 0, blocks: 0, turnovers: 0, touches: 0 },
  );
}

interface TotalsStatRow {
  label: string;
  awayVal: number;
  homeVal: number;
  higherIsBetter: boolean;
}

function buildTotalsRows(a: Totals, h: Totals): TotalsStatRow[] {
  return [
    { label: 'Goals',     awayVal: a.goals,     homeVal: h.goals,     higherIsBetter: true  },
    { label: 'Assists',   awayVal: a.assists,    homeVal: h.assists,   higherIsBetter: true  },
    { label: 'Blocks',    awayVal: a.blocks,     homeVal: h.blocks,    higherIsBetter: true  },
    { label: 'Turnovers', awayVal: a.turnovers,  homeVal: h.turnovers, higherIsBetter: false },
    { label: 'Touches',   awayVal: a.touches,    homeVal: h.touches,   higherIsBetter: true  },
  ];
}

function rowWinner(r: TotalsStatRow): 'away' | 'home' | 'tie' {
  if (r.awayVal === r.homeVal) return 'tie';
  const awayWins = r.higherIsBetter ? r.awayVal > r.homeVal : r.awayVal < r.homeVal;
  return awayWins ? 'away' : 'home';
}

interface TeamTotalsComparisonProps {
  away: PulGameTeamSide;
  home: PulGameTeamSide;
  awayTotals: Totals;
  homeTotals: Totals;
}

function TeamTotalsComparison({ away, home, awayTotals, homeTotals }: TeamTotalsComparisonProps) {
  const rows = buildTotalsRows(awayTotals, homeTotals);
  // Real team brand colors (now on the game side); neutral fallback per side.
  const awayColor = away.accentColor ?? NEUTRAL_COLOR;
  const homeColor = home.accentColor ?? NEUTRAL_COLOR;

  return (
    <section
      aria-labelledby="pul-team-totals-heading"
      className="px-6 py-6 md:px-14 md:py-8 border-t border-hairline"
    >
      <h2
        id="pul-team-totals-heading"
        className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-5 pb-2 border-b border-hairline"
      >
        <span>Team totals · this game</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-ink opacity-60"
              aria-hidden="true"
            />
            <span className="text-faint">{away.abbrev}</span>
          </span>
          <span className="text-faint opacity-40">/</span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-muted opacity-60"
              aria-hidden="true"
            />
            <span className="text-faint">{home.abbrev}</span>
          </span>
        </span>
      </h2>

      <ul className="flex flex-col gap-0">
        {rows.map((r) => {
          const win = rowWinner(r);
          const total = r.awayVal + r.homeVal;
          const awayShare = total > 0 ? r.awayVal / total : 0.5;
          const homeShare = total > 0 ? r.homeVal / total : 0.5;
          // Each side owns up to 50% of the track.
          const awayPct = Math.round(awayShare * 50);
          const homePct = Math.round(homeShare * 50);

          const awayNumClass =
            win === 'away'
              ? 'text-ink font-bold'
              : win === 'home'
                ? 'text-faint font-semibold'
                : 'text-muted font-semibold';
          const homeNumClass =
            win === 'home'
              ? 'text-ink font-bold'
              : win === 'away'
                ? 'text-faint font-semibold'
                : 'text-muted font-semibold';

          const ariaLabel = `${r.label}: ${away.abbrev} ${r.awayVal}, ${home.abbrev} ${r.homeVal}`;

          return (
            <li key={r.label} className="py-3.5 border-b border-hairline last:border-b-0">
              {/* Numbers row */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 mb-2">
                <span
                  className={`text-left tabular text-[17px] md:text-[21px] italic tracking-[-0.02em] font-tight ${awayNumClass}`}
                >
                  {r.awayVal}
                </span>
                <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight whitespace-nowrap">
                  {r.label}
                </span>
                <span
                  className={`text-right tabular text-[17px] md:text-[21px] italic tracking-[-0.02em] font-tight ${homeNumClass}`}
                >
                  {r.homeVal}
                </span>
              </div>

              {/* Dual-fill comparison bar, anchored at center */}
              <div
                role="img"
                aria-label={ariaLabel}
                className="relative h-[4px] rounded-full overflow-hidden bg-hairline"
              >
                {/* Away: grows from center leftward */}
                <span
                  className="absolute top-0 right-1/2 h-full rounded-l-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${awayPct}%`, background: awayColor }}
                  aria-hidden="true"
                />
                {/* Home: grows from center rightward */}
                <span
                  className="absolute top-0 left-1/2 h-full rounded-r-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${homePct}%`, background: homeColor }}
                  aria-hidden="true"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Box score section ─────────────────────────────────────────────────────────
// Two tables: away then home. Header shows "{ABBR} · Box Score".
// Horizontally scrollable on mobile. Minor columns (Touches) hidden on small screens.
// Clickable rows when profileId is set — link to /players/[id].

interface BoxscoreSectionProps {
  away: PulGameTeamSide;
  home: PulGameTeamSide;
  awayRows: PulBoxscoreRow[];
  homeRows: PulBoxscoreRow[];
}

function BoxscoreSection({ away, home, awayRows, homeRows }: BoxscoreSectionProps) {
  return (
    <section
      aria-labelledby="pul-boxscore-heading"
      className="px-6 py-6 md:px-14 md:py-8 border-t border-hairline"
    >
      <h2
        id="pul-boxscore-heading"
        className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-5 pb-2 border-b border-hairline"
      >
        Box scores
      </h2>

      <div className="flex flex-col gap-10">
        {awayRows.length > 0 && (
          <BoxscoreTable
            side={away}
            rows={awayRows}
          />
        )}
        {homeRows.length > 0 && (
          <BoxscoreTable
            side={home}
            rows={homeRows}
          />
        )}
        {awayRows.length === 0 && homeRows.length === 0 && (
          <p className="text-[13px] text-faint font-tight italic">
            No player stats available for this game.
          </p>
        )}
      </div>
    </section>
  );
}

// Column definitions — "hidden" flag hides on mobile to keep the table usable at 375px.
const BOX_COLS = [
  { key: '#',       label: '#',      title: 'Jersey number',  align: 'left',  hide: false },
  { key: 'player',  label: 'Player', title: 'Player',         align: 'left',  hide: false },
  { key: 'goals',   label: 'G',      title: 'Goals',          align: 'right', hide: false },
  { key: 'assists', label: 'A',      title: 'Assists',        align: 'right', hide: false },
  { key: 'blocks',  label: 'Blk',   title: 'Blocks',         align: 'right', hide: false },
  { key: 'to',      label: 'TO',     title: 'Turnovers',      align: 'right', hide: false },
  { key: 'pm',      label: '+/−',    title: 'Plus / Minus',   align: 'right', hide: false },
  { key: 'touches', label: 'TCH',    title: 'Touches',        align: 'right', hide: true  }, // hidden on mobile
] as const;

function BoxscoreTable({ side, rows }: { side: PulGameTeamSide; rows: PulBoxscoreRow[] }) {
  const title = `${side.abbrev} · Box score`;

  return (
    <div>
      {/* Sub-heading */}
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-muted font-tight">
          {title}
        </span>
        <span className="text-[11px] text-faint tabular font-tight">{rows.length} players</span>
      </div>

      {/* Horizontal scroll wrapper — allows full table on narrow viewports */}
      <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
        <table className="w-full min-w-[540px] border-collapse" aria-label={title}>
          <thead>
            <tr>
              {BOX_COLS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  title={col.title}
                  className={[
                    'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                    'border-b border-border whitespace-nowrap',
                    col.align === 'left' ? 'text-left' : 'text-right',
                    col.hide ? 'hidden sm:table-cell' : '',
                  ].join(' ')}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <BoxscoreRow key={`${row.playerName}-${i}`} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoxscoreRow({ row }: { row: PulBoxscoreRow }) {
  const pm = formatPlusMinus(row.plusMinus);
  const pmClass =
    row.plusMinus > 0
      ? 'text-ink font-semibold'
      : row.plusMinus < 0
        ? 'text-faint'
        : 'text-muted';

  const cells = (
    <>
      <td className="px-3 py-2.5 text-[12px] border-b border-hairline text-left text-faint tabular font-tight">
        {row.jerseyNumber ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-ink font-medium font-tight min-w-[120px]">
        {row.playerName}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {row.goals}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {row.assists}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {row.blocks}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {row.turnovers}
      </td>
      <td className={`px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular font-tight ${pmClass}`}>
        {pm}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight hidden sm:table-cell">
        {row.touches}
      </td>
    </>
  );

  if (row.profileId) {
    return (
      <tr className="hover:bg-surface-hi transition-colors duration-100 cursor-pointer group">
        {/* Wrap the row in a link via the player name cell; the tr itself is the interaction target */}
        <td className="px-3 py-2.5 text-[12px] border-b border-hairline text-left text-faint tabular font-tight">
          {row.jerseyNumber ?? '—'}
        </td>
        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left font-medium font-tight min-w-[120px]">
          <Link
            href={`/players/${row.profileId}?from=pul`}
            className="text-ink group-hover:text-accent transition-colors duration-100 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-2"
          >
            {row.playerName}
          </Link>
        </td>
        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
          {row.goals}
        </td>
        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
          {row.assists}
        </td>
        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
          {row.blocks}
        </td>
        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
          {row.turnovers}
        </td>
        <td className={`px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular font-tight ${pmClass}`}>
          {pm}
        </td>
        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight hidden sm:table-cell">
          {row.touches}
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-surface-hi transition-colors duration-100">
      {cells}
    </tr>
  );
}
