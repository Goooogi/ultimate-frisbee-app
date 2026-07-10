'use client';

// WUL game-detail component — mirrors pul-game-detail.tsx exactly.
// Differences from PUL:
//   • WulGameTeamSide carries accentColor directly — no neutral fallback needed.
//   • WUL has no venue/time in data — location line is omitted from StatusStrip.
//   • WulBoxscoreRow is richer: adds pointsPlayed, totalYards, completions, throws.
//     The box score table adds a Pts column (hidden on mobile) for pointsPlayed.
//   • plusMinus can be fractional (.5) in WUL data — format with up to one decimal.
//   • The WulTeamLogo adapter maps WulGameTeamSide → the WulTeamLogo inline shape.

import Link from 'next/link';
import { AppShell } from '@/components/page-shell';
import { Breadcrumbs } from '@/components/breadcrumbs';
import type { WulGame, WulGameBoxscore, WulBoxscoreRow, WulGameTeamSide } from '@/lib/wul/data';

// ── Props ─────────────────────────────────────────────────────────────────────

interface WulGameDetailProps {
  game: WulGame;
  boxscore: WulGameBoxscore;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/** Format a WUL weekLabel: 'regular' → 'Regular Season', 'post' → 'Postseason'. */
function formatWeekLabel(label: string): string {
  if (label === 'regular') return 'Regular Season';
  if (label === 'post') return 'Postseason';
  return label.replace(/-/g, ' ').toUpperCase();
}

/** Format an ISO date string (yyyy-mm-dd) as "Jun 28, 2026". */
function formatGameDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format +/- with explicit sign. WUL plusMinus can be fractional (.5). */
function formatPlusMinus(val: number): string {
  // Show up to one decimal place only when needed, e.g. "+1.5" or "-0.5".
  const formatted = Number.isInteger(val) ? String(Math.abs(val)) : Math.abs(val).toFixed(1);
  if (val > 0) return `+${formatted}`;
  if (val < 0) return `-${formatted}`;
  return '0';
}

// ── Neutral fallback color — used only when accentColor is somehow null ───────
const NEUTRAL_COLOR = '#6b7280';

// ── Root component ────────────────────────────────────────────────────────────

export function WulGameDetail({ game, boxscore }: WulGameDetailProps) {
  return (
    <AppShell>
      <DetailBody game={game} boxscore={boxscore} />
    </AppShell>
  );
}

// ── Detail body ───────────────────────────────────────────────────────────────

function DetailBody({ game, boxscore }: WulGameDetailProps) {
  const { away, home } = game;
  const isFinal = game.status === 'final';

  const awayDisplayName = [away.city, away.mascot].filter(Boolean).join(' ') || away.abbrev;
  const homeDisplayName = [home.city, home.mascot].filter(Boolean).join(' ') || home.abbrev;
  const matchupLabel = `${awayDisplayName} vs ${homeDisplayName}`;

  const awayWin = isFinal && away.score != null && home.score != null && away.score > home.score;
  const homeWin = isFinal && away.score != null && home.score != null && home.score > away.score;

  const hasBoxscore = boxscore.away.length > 0 || boxscore.home.length > 0;

  const awayTotals = sumTotals(boxscore.away);
  const homeTotals = sumTotals(boxscore.home);

  return (
    <div className="bg-bg-warm flex flex-col font-tight text-ink">

      {/* ── Breadcrumbs + eyebrow ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2 md:px-14 md:pt-7 md:pb-3 flex-shrink-0">
        <Breadcrumbs
          crumbs={[
            { label: 'Home', href: '/' },
            { label: 'Scores', href: '/scores' },
            { label: matchupLabel },
          ]}
        />
        <span className="text-[10.5px] font-bold tracking-[0.18em] text-accent uppercase flex-shrink-0">
          WUL · {formatWeekLabel(game.weekLabel)}
        </span>
      </div>

      {/* ── Score card: status strip + score block, one floating unit ──── */}
      <div className="px-5 pb-5 md:px-14 md:pb-8">
        <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
          <StatusStrip game={game} isFinal={isFinal} />
          <ScoreBlock
            away={away}
            home={home}
            awayWin={awayWin}
            homeWin={homeWin}
            showScore={isFinal}
          />
        </div>
      </div>

      {/* ── Team totals comparison (only when box score data is present) ── */}
      {hasBoxscore && (
        <TeamTotalsComparison
          away={away}
          home={home}
          awayTotals={awayTotals}
          homeTotals={homeTotals}
        />
      )}

      {/* ── Per-player stat leaders (only when box score data is present) ── */}
      {hasBoxscore && (
        <GameStatLeaders
          away={away}
          home={home}
          awayRows={boxscore.away}
          homeRows={boxscore.home}
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
      <div className="flex items-center justify-between px-6 pt-2 pb-8 md:px-14 md:pb-10 text-faint">
        <span className="text-[11px] font-semibold tracking-[0.06em]">
          WUL · {game.season}
        </span>
        <span className="text-[11px] font-semibold tracking-[0.06em] tabular">
          {game.gameDate ? formatGameDate(game.gameDate) : formatWeekLabel(game.weekLabel)}
        </span>
      </div>
    </div>
  );
}

// ── Status strip ──────────────────────────────────────────────────────────────
// WUL data has no venue/time — we only show the date meta on final games.
// Upcoming games show just the date in the main strip (no location line).

function StatusStrip({ game, isFinal }: { game: WulGame; isFinal: boolean }) {
  return (
    <div className="px-6 py-4 md:px-10 md:py-5 border-b border-hairline flex-shrink-0">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <span
          className={`text-[13px] font-bold tracking-[0.18em] uppercase ${
            isFinal ? 'text-ink' : 'text-accent'
          }`}
        >
          {isFinal ? 'Final' : 'Upcoming'}
        </span>
        {!isFinal && game.gameDate && (
          <span className="text-[20px] md:text-[28px] font-bold tracking-[-0.03em] text-ink tabular leading-none">
            {formatGameDate(game.gameDate)}
          </span>
        )}
      </div>
      {isFinal && game.gameDate && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-[11px] font-semibold tracking-[0.06em] text-muted">
          <span>{formatGameDate(game.gameDate)}</span>
        </div>
      )}
    </div>
  );
}

// ── Score block ───────────────────────────────────────────────────────────────
// Dramatic two-half split: stencil abbr backdrop + tinted gradient from top.
// WulGameTeamSide carries accentColor — real brand colors are used directly.

interface ScoreBlockProps {
  away: WulGameTeamSide;
  home: WulGameTeamSide;
  awayWin: boolean;
  homeWin: boolean;
  showScore: boolean;
}

function ScoreBlock({ away, home, awayWin, homeWin, showScore }: ScoreBlockProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 flex-1">
      <ScoreHalf side={away} label="Away" win={awayWin} showScore={showScore} />
      <ScoreHalf side={home} label="Home" win={homeWin} showScore={showScore} bordered />
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
  side: WulGameTeamSide;
  label: 'Away' | 'Home';
  win: boolean;
  showScore: boolean;
  bordered?: boolean;
}) {
  const teamColor = side.accentColor ?? NEUTRAL_COLOR;

  return (
    <div
      className={[
        'relative overflow-hidden bg-surface flex flex-col justify-between gap-5',
        'px-6 py-7 md:px-10 md:py-10 min-h-[260px] md:min-h-[320px]',
        bordered ? 'border-t md:border-t-0 md:border-l border-hairline' : '',
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
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <WulTeamLogoBlock
            logoUrl={side.logoUrl}
            accentColor={side.accentColor}
            abbrev={side.abbrev}
            size={64}
          />
        </span>
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

// Inline WUL logo block — same pattern as PulTeamLogo but reads from the
// WulGameTeamSide data (logoUrl + accentColor + abbrev).
function WulTeamLogoBlock({
  logoUrl,
  accentColor,
  abbrev,
  size,
}: {
  logoUrl: string | null;
  accentColor: string | null;
  abbrev: string;
  size: number;
}) {
  if (logoUrl) {
    return (
      <span
        className="inline-flex items-center justify-center flex-shrink-0 overflow-hidden rounded-md bg-white border border-[rgb(var(--ink)/0.08)]"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          className="object-contain"
          style={{ width: size * 0.84, height: size * 0.84 }}
        />
      </span>
    );
  }

  const bg = accentColor ?? '#1d2535';
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 relative overflow-hidden rounded-md"
      style={{ width: size, height: size, background: bg }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0"
        style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.12) 0%, transparent 60%)' }}
      />
      <span
        className="relative z-10 font-display font-bold"
        style={{ color: '#fff', fontSize: Math.max(9, size * 0.3), letterSpacing: '0.04em' }}
      >
        {abbrev}
      </span>
    </span>
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

function sumTotals(rows: WulBoxscoreRow[]): Totals {
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
  away: WulGameTeamSide;
  home: WulGameTeamSide;
  awayTotals: Totals;
  homeTotals: Totals;
}

function TeamTotalsComparison({ away, home, awayTotals, homeTotals }: TeamTotalsComparisonProps) {
  const rows = buildTotalsRows(awayTotals, homeTotals);
  const awayColor = away.accentColor ?? NEUTRAL_COLOR;
  const homeColor = home.accentColor ?? NEUTRAL_COLOR;

  return (
    <section
      aria-labelledby="wul-team-totals-heading"
      className="px-5 pb-5 md:px-14 md:pb-8"
    >
      <div className="bg-surface rounded-card-lg shadow-card p-5 md:p-7">
      <h2
        id="wul-team-totals-heading"
        className="flex items-end justify-between gap-4 mb-5"
      >
        <span className="font-display italic font-bold text-[20px] md:text-[24px] leading-[0.95] tracking-[-0.02em] text-ink">
          Team totals
        </span>
        <span className="flex items-center gap-3 pb-0.5">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-ink opacity-60"
              aria-hidden="true"
            />
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-faint">{away.abbrev}</span>
          </span>
          <span className="text-faint opacity-40">/</span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-muted opacity-60"
              aria-hidden="true"
            />
            <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-faint">{home.abbrev}</span>
          </span>
        </span>
      </h2>

      <ul className="flex flex-col gap-0">
        {rows.map((r) => {
          const win = rowWinner(r);
          const total = r.awayVal + r.homeVal;
          const awayShare = total > 0 ? r.awayVal / total : 0.5;
          const homeShare = total > 0 ? r.homeVal / total : 0.5;
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
      </div>
    </section>
  );
}

// ── Per-game stat leaders ─────────────────────────────────────────────────────
// Computed entirely from the existing boxscore rows — no additional fetching.
// WUL adds Points Played on top of PUL's 5 categories.

interface WulLeaderResult {
  name: string | null;   // null → no rows / max is 0
  value: number;         // the max value (0 when no data)
  tied: boolean;         // true when multiple players share the max
  tieCount: number;      // how many players are tied (0 when not tied)
}

interface WulLeaderCategory {
  title: string;
  away: WulLeaderResult;
  home: WulLeaderResult;
}

/** Extract the leader for a single stat field from a set of rows. */
function wulLeader(rows: WulBoxscoreRow[], field: keyof Pick<WulBoxscoreRow, 'goals' | 'assists' | 'blocks' | 'turnovers' | 'touches' | 'pointsPlayed'>): WulLeaderResult {
  if (rows.length === 0) return { name: null, value: 0, tied: false, tieCount: 0 };
  const max = Math.max(...rows.map((r) => r[field]));
  if (max === 0) return { name: null, value: 0, tied: false, tieCount: 0 };
  const leaders = rows.filter((r) => r[field] === max);
  if (leaders.length > 1) return { name: null, value: max, tied: true, tieCount: leaders.length };
  return { name: leaders[0].playerName, value: max, tied: false, tieCount: 0 };
}

function computeWulLeaders(awayRows: WulBoxscoreRow[], homeRows: WulBoxscoreRow[]): WulLeaderCategory[] {
  const cats: Array<{ title: string; field: keyof Pick<WulBoxscoreRow, 'goals' | 'assists' | 'blocks' | 'turnovers' | 'touches' | 'pointsPlayed'> }> = [
    { title: 'Goals',         field: 'goals'        },
    { title: 'Assists',       field: 'assists'      },
    { title: 'Blocks',        field: 'blocks'       },
    { title: 'Turnovers',     field: 'turnovers'    },
    { title: 'Touches',       field: 'touches'      },
    { title: 'Points Played', field: 'pointsPlayed' },
  ];
  return cats.map(({ title, field }) => ({
    title,
    away: wulLeader(awayRows, field),
    home: wulLeader(homeRows, field),
  }));
}

interface GameStatLeadersProps {
  away: WulGameTeamSide;
  home: WulGameTeamSide;
  awayRows: WulBoxscoreRow[];
  homeRows: WulBoxscoreRow[];
}

function GameStatLeaders({ away, home, awayRows, homeRows }: GameStatLeadersProps) {
  const categories = computeWulLeaders(awayRows, homeRows);
  // Keep a category if either side has something to show.
  const rendered = categories.filter((c) => c.away.value > 0 || c.home.value > 0);
  if (rendered.length === 0) return null;

  return (
    <section
      aria-labelledby="wul-game-leaders-heading"
      className="px-5 pb-5 md:px-14 md:pb-8"
    >
      <h2
        id="wul-game-leaders-heading"
        className="flex items-baseline justify-between gap-4 mb-4"
      >
        <span className="font-display italic font-bold text-[20px] md:text-[24px] leading-[0.95] tracking-[-0.02em] text-ink">
          Stat leaders
        </span>
        <span className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint">Top performers</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rendered.map((c) => (
          <LeaderCard
            key={c.title}
            title={c.title}
            awaySide={away}
            homeSide={home}
            awayResult={c.away}
            homeResult={c.home}
          />
        ))}
      </div>
    </section>
  );
}

function LeaderCard({
  title,
  awaySide,
  homeSide,
  awayResult,
  homeResult,
}: {
  title: string;
  awaySide: WulGameTeamSide;
  homeSide: WulGameTeamSide;
  awayResult: WulLeaderResult;
  homeResult: WulLeaderResult;
}) {
  // Higher raw count wins; ties stay neutral.
  const awayWins = awayResult.value > 0 && awayResult.value > homeResult.value;
  const homeWins = homeResult.value > 0 && homeResult.value > awayResult.value;
  return (
    <div className="bg-surface rounded-card shadow-card px-3 py-3.5 md:px-4 md:py-4 flex flex-col gap-3">
      <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight text-center">
        {title}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        <LeaderHalf side={awaySide} label="Away" result={awayResult} winning={awayWins} align="left" />
        <div className="w-px bg-hairline" aria-hidden="true" />
        <LeaderHalf side={homeSide} label="Home" result={homeResult} winning={homeWins} align="right" />
      </div>
    </div>
  );
}

function LeaderHalf({
  side,
  label,
  result,
  winning,
  align,
}: {
  side: WulGameTeamSide;
  label: 'Away' | 'Home';
  result: WulLeaderResult;
  winning: boolean;
  align: 'left' | 'right';
}) {
  const isLeft = align === 'left';

  const nameLine = result.name !== null
    ? result.name
    : result.tied
      ? `${result.tieCount} players tied`
      : null;

  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${isLeft ? 'items-start text-left' : 'items-end text-right'}`}>
      <div className={`flex items-center gap-2 min-w-0 ${isLeft ? '' : 'flex-row-reverse'}`}>
        <span className="inline-flex rounded-full overflow-hidden flex-shrink-0">
          <WulTeamLogoBlock
            logoUrl={side.logoUrl}
            accentColor={side.accentColor}
            abbrev={side.abbrev}
            size={22}
          />
        </span>
        <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
          {label} · {side.abbrev}
        </span>
      </div>
      <span className="text-[12px] font-semibold text-ink font-tight leading-tight w-full break-words">
        {nameLine !== null ? (
          result.tied ? <span className="text-muted">{nameLine}</span> : nameLine
        ) : (
          <span className="text-faint italic">No data</span>
        )}
      </span>
      <span
        className={`tabular text-[26px] md:text-[28px] font-bold leading-none tracking-[-0.02em] font-tight mt-auto ${
          winning ? 'text-ink' : 'text-muted'
        }`}
      >
        {result.value > 0 || result.tied ? result.value : '—'}
      </span>
    </div>
  );
}

// ── Box score section ─────────────────────────────────────────────────────────
// Two tables: away then home. Header shows "{ABBR} · Box Score".
// Horizontally scrollable on mobile. Minor columns hidden on small screens.
// Clickable rows when profileId is set — link to /players/[id].

interface BoxscoreSectionProps {
  away: WulGameTeamSide;
  home: WulGameTeamSide;
  awayRows: WulBoxscoreRow[];
  homeRows: WulBoxscoreRow[];
}

function BoxscoreSection({ away, home, awayRows, homeRows }: BoxscoreSectionProps) {
  return (
    <section
      aria-labelledby="wul-boxscore-heading"
      className="px-5 pb-8 md:px-14 md:pb-12"
    >
      <h2
        id="wul-boxscore-heading"
        className="font-display italic font-bold text-[20px] md:text-[24px] leading-[0.95] tracking-[-0.02em] text-ink mb-4"
      >
        Box scores
      </h2>

      <div className="flex flex-col gap-6">
        {awayRows.length > 0 && <BoxscoreTable side={away} rows={awayRows} />}
        {homeRows.length > 0 && <BoxscoreTable side={home} rows={homeRows} />}
        {awayRows.length === 0 && homeRows.length === 0 && (
          <p className="text-[13px] text-faint font-tight italic">
            No player stats available for this game.
          </p>
        )}
      </div>
    </section>
  );
}

// Column definitions. WUL adds Pts (pointsPlayed) — hidden on mobile.
const BOX_COLS = [
  { key: '#',       label: '#',    title: 'Jersey number',  align: 'left',  hide: false },
  { key: 'player',  label: 'Player', title: 'Player',       align: 'left',  hide: false },
  { key: 'goals',   label: 'G',    title: 'Goals',          align: 'right', hide: false },
  { key: 'assists', label: 'A',    title: 'Assists',        align: 'right', hide: false },
  { key: 'blocks',  label: 'Blk',  title: 'Blocks',        align: 'right', hide: false },
  { key: 'to',      label: 'TO',   title: 'Turnovers',     align: 'right', hide: false },
  { key: 'pm',      label: '+/−',  title: 'Plus / Minus',  align: 'right', hide: false },
  { key: 'touches', label: 'TCH',  title: 'Touches',       align: 'right', hide: true  },
  { key: 'pts',     label: 'Pts',  title: 'Points Played', align: 'right', hide: true  },
] as const;

function BoxscoreTable({ side, rows }: { side: WulGameTeamSide; rows: WulBoxscoreRow[] }) {
  const title = `${side.abbrev} · Box score`;

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-4 md:p-5">
      {/* Sub-heading */}
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-muted font-tight">
          {title}
        </span>
        <span className="text-[11px] text-faint tabular font-tight">{rows.length} players</span>
      </div>

      {/* Horizontal scroll wrapper — allows full table on narrow viewports */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <table className="w-full min-w-[540px] border-collapse" aria-label={title}>
          <thead>
            <tr>
              {BOX_COLS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  title={col.title}
                  className={[
                    'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-faint',
                    'whitespace-nowrap',
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

function BoxscoreRow({ row }: { row: WulBoxscoreRow }) {
  const pm = formatPlusMinus(row.plusMinus);
  const pmClass =
    row.plusMinus > 0
      ? 'text-ink font-semibold'
      : row.plusMinus < 0
        ? 'text-faint'
        : 'text-muted';

  // Shared stat cells (jersey through touches + pts)
  const statCells = (
    <>
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
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight hidden sm:table-cell">
        {row.pointsPlayed}
      </td>
    </>
  );

  if (row.profileId) {
    return (
      <tr className="hover:bg-surface-hi transition-colors duration-100 cursor-pointer group">
        <td className="px-3 py-2.5 text-[12px] border-b border-hairline text-left text-faint tabular font-tight">
          {row.jerseyNumber ?? '—'}
        </td>
        <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left font-medium font-tight min-w-[120px]">
          <Link
            href={`/players/${row.profileId}?from=wul`}
            className="text-ink group-hover:text-accent transition-colors duration-100 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-2"
          >
            {row.playerName}
          </Link>
        </td>
        {statCells}
      </tr>
    );
  }

  return (
    <tr className="hover:bg-surface-hi transition-colors duration-100">
      <td className="px-3 py-2.5 text-[12px] border-b border-hairline text-left text-faint tabular font-tight">
        {row.jerseyNumber ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-ink font-medium font-tight min-w-[120px]">
        {row.playerName}
      </td>
      {statCells}
    </tr>
  );
}
