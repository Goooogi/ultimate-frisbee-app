'use client';

import Link from 'next/link';
import { teamMeta, type TeamMeta } from '@/lib/ufa/teams';
import { gameUiState, formatStartCompact } from '@/lib/ufa/format';
import type {
  UfaGame,
  UfaGameStatCategory,
  UfaGameStatLeader,
  UfaGameStatsResponse,
  UfaGameTeamStats,
  UfaStanding,
  UfaTeamStat,
} from '@/lib/ufa/types';
import type { Today } from '@/lib/today';
import { LiveDotAccent } from '@/components/live-dot';
import { AppShell } from '@/components/page-shell';
import { GameBoxscore } from '@/components/game-boxscore';
import { TeamLogo } from '@/components/team-logo';

export interface GameEnrichment {
  awayStanding: UfaStanding | null;
  homeStanding: UfaStanding | null;
  awayTeamStat: UfaTeamStat | null;
  homeTeamStat: UfaTeamStat | null;
  season: number;
  gameStats: UfaGameStatsResponse | null;
}

interface GameDetailProps {
  game: UfaGame;
  today: Today;
  enrichment?: GameEnrichment;
}

export function GameDetail({ game, today, enrichment }: GameDetailProps) {
  return (
    <AppShell>
      <DetailBody game={game} today={today} enrichment={enrichment} />
    </AppShell>
  );
}

// ── Field detail ──────────────────────────────────────────────────────────────

/**
 * Unified game-detail body (no theme variants).
 * Layout follows the light/Field treatment for chrome (back arrow, status
 * strip, hairlines, sections); the score block uses the broadcast-style
 * dramatic split with stencil + tinted gradient on both themes — colors come
 * from CSS variables so it reads correctly in light and dark.
 */
function DetailBody({ game, today, enrichment }: { game: UfaGame; today: Today; enrichment?: GameEnrichment }) {
  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const state = gameUiState(game);
  const start = formatStartCompact(game);
  const hasEnrichment = !!(enrichment?.awayStanding || enrichment?.awayTeamStat || enrichment?.homeStanding || enrichment?.homeTeamStat);
  const hasGameStats =
    !!(enrichment?.gameStats?.leaderCategories && enrichment.gameStats.leaderCategories.length > 0);

  return (
    <div className="bg-surface flex flex-col font-tight text-ink">
      <div className="flex items-center justify-between px-5 py-3 md:px-14 md:py-5 flex-shrink-0">
        <Link
          href="/scores"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-ink transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          <BackArrow />
          All games
        </Link>
        <span className="text-[10px] font-bold tracking-[0.18em] text-faint uppercase">
          UFA · Regular Season
        </span>
      </div>

      {/* status strip */}
      <div className="px-6 pt-[18px] pb-6 md:px-14 md:pt-7 md:pb-9 border-b border-hairline flex-shrink-0">
        <div className="inline-flex items-center gap-2 mb-3">
          {state.isLive && <LiveDotAccent size={7} />}
          <span
            className={`text-[11px] font-bold tracking-[0.18em] uppercase ${
              state.isLive ? 'text-accent' : 'text-muted'
            }`}
          >
            {state.isLive ? 'Live now' : state.isFinal ? 'Final' : 'Upcoming'}
          </span>
        </div>
        <div className="flex items-baseline gap-4 flex-wrap">
          {state.isUpcoming ? (
            <span className="text-[28px] md:text-[44px] font-bold tracking-[-0.04em] text-ink tabular leading-none">
              {start}
            </span>
          ) : (
            <span className="text-[44px] md:text-[64px] font-bold tracking-[-0.05em] text-ink tabular leading-none">
              {state.isFinal ? 'FINAL' : 'LIVE'}
            </span>
          )}
        </div>
        {(game.locationName || game.streamingURL || game.ticketURL) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-[11px] font-semibold tracking-[0.06em] text-muted">
            {game.locationName && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true">@</span>
                {game.locationURL ? (
                  <a
                    href={game.locationURL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-4 hover:underline hover:text-ink"
                  >
                    {game.locationName}
                  </a>
                ) : (
                  game.locationName
                )}
              </span>
            )}
            {game.streamingURL && (
              <a
                href={game.streamingURL}
                target="_blank"
                rel="noreferrer"
                className="uppercase underline-offset-4 hover:underline hover:text-ink"
              >
                Watch
              </a>
            )}
            {game.ticketURL && (
              <a
                href={game.ticketURL}
                target="_blank"
                rel="noreferrer"
                className="uppercase underline-offset-4 hover:underline hover:text-ink"
              >
                Tickets
              </a>
            )}
          </div>
        )}
      </div>

      <ScoreBlock
        away={away}
        home={home}
        awayCity={game.awayTeamCity}
        awayName={game.awayTeamName}
        homeCity={game.homeTeamCity}
        homeName={game.homeTeamName}
        awayScore={game.awayScore}
        homeScore={game.homeScore}
        awayWin={state.awayWin}
        homeWin={state.homeWin}
        showScore={state.hasScore || state.isLive || state.isFinal}
      />

      {hasGameStats && (
        <FieldGameLeaders
          away={away}
          home={home}
          awayName={game.awayTeamName}
          homeName={game.homeTeamName}
          categories={enrichment!.gameStats!.leaderCategories!}
        />
      )}

      {enrichment?.gameStats?.awayTeamStats && enrichment.gameStats.homeTeamStats && (
        <FieldGameTeamStats
          away={away}
          home={home}
          awayName={game.awayTeamName}
          homeName={game.homeTeamName}
          awayStats={enrichment.gameStats.awayTeamStats}
          homeStats={enrichment.gameStats.homeTeamStats}
        />
      )}

      {/* Render the breakdown whenever the game has stat-leader data, not just
          when status === Final/Live — the UFA can be slow to flip status, and
          stat leaders being populated is a more reliable "this game has data"
          signal. */}
      {hasGameStats && (
        <div className="px-6 md:px-14 border-t border-hairline">
          <GameBoxscore
            gameID={game.gameID}
            away={away}
            home={home}
            awayName={game.awayTeamName}
            homeName={game.homeTeamName}
          />
        </div>
      )}

      {hasEnrichment && enrichment && (
        <FieldSeasonComparison
          season={enrichment.season}
          away={away}
          home={home}
          awayCity={game.awayTeamCity}
          awayName={game.awayTeamName}
          homeCity={game.homeTeamCity}
          homeName={game.homeTeamName}
          awayStanding={enrichment.awayStanding}
          homeStanding={enrichment.homeStanding}
          awayStats={enrichment.awayTeamStat}
          homeStats={enrichment.homeTeamStat}
        />
      )}

      <div className="flex items-center justify-between px-6 pt-3.5 pb-6 md:px-14 md:py-5 border-t border-hairline text-muted">
        <span className="text-[11px] font-semibold tracking-[0.06em]">
          {state.isLive ? 'Auto-refreshing · 30s' : 'UFA · Regular Season'}
        </span>
        <span className="text-[11px] font-semibold tracking-[0.06em] tabular">
          {today.weekday} · {today.month} {today.day}
        </span>
      </div>
    </div>
  );
}

// ── Score block (used on every game detail page, both themes) ───────────────
// Dramatic split inspired by the broadcast design — stencil team-abbr backdrop,
// tinted gradient overlay using the team's primary color, big accent-colored
// score for the winner. Reads correctly in light & dark because all neutral
// colors come from CSS variables (--surface, --ink, --muted, --accent, etc.).

interface ScoreBlockProps {
  away: TeamMeta;
  home: TeamMeta;
  awayCity: string;
  awayName: string;
  homeCity: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  awayWin: boolean;
  homeWin: boolean;
  showScore: boolean;
}

function ScoreBlock(p: ScoreBlockProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 flex-1">
      <ScoreHalf
        team={p.away}
        side="Away"
        city={p.awayCity}
        name={p.awayName}
        score={p.awayScore}
        win={p.awayWin}
        showScore={p.showScore}
      />
      <ScoreHalf
        team={p.home}
        side="Home"
        city={p.homeCity}
        name={p.homeName}
        score={p.homeScore}
        win={p.homeWin}
        showScore={p.showScore}
        bordered
      />
    </div>
  );
}

function ScoreHalf({
  team,
  side,
  city,
  name,
  score,
  win,
  showScore,
  bordered,
}: {
  team: TeamMeta;
  side: 'Away' | 'Home';
  city: string;
  name: string;
  score: number;
  win: boolean;
  showScore: boolean;
  bordered?: boolean;
}) {
  return (
    <div
      className={[
        'relative overflow-hidden bg-surface flex flex-col justify-between gap-5',
        'px-6 py-7 md:px-12 md:py-10 min-h-[260px] md:min-h-[320px]',
        bordered ? 'border-t md:border-t-0 md:border-l border-border' : '',
      ].join(' ')}
    >
      {/* tinted gradient drifts in from the top */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(180deg, ${team.primary}55, transparent 70%)`,
        }}
        aria-hidden="true"
      />
      {/* outlined team-abbr stencil floats behind the score */}
      <div
        className="absolute font-display font-bold leading-none pointer-events-none select-none"
        style={{
          bottom: -30,
          right: -10,
          fontSize: 'clamp(110px, 18vw, 240px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'transparent',
          WebkitTextStroke: `1px ${team.primary}`,
          opacity: 0.55,
        }}
        aria-hidden="true"
      >
        {team.abbr}
      </div>

      {/* identity row — logo + Away/Home label + city + name */}
      <div className="relative flex items-center gap-4 min-w-0">
        <TeamLogo team={team} size={64} className="flex-shrink-0" />
        <div className="min-w-0">
          <div className="font-sans text-[10px] font-bold tracking-[0.22em] uppercase text-muted">
            {side} · {team.abbr}
          </div>
          <div className="font-sans text-[12px] md:text-[14px] text-muted font-medium truncate">
            {city}
          </div>
          <div className="font-display text-[28px] md:text-[44px] font-bold text-ink tracking-[0.01em] leading-none uppercase truncate">
            {name}
          </div>
        </div>
      </div>

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
        {showScore ? score : '–'}
      </span>
    </div>
  );
}

function BackArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 2L4 7l5 5" />
    </svg>
  );
}

// ── Season comparison ────────────────────────────────────────────────────────
// Shared shape for both Field + Broadcast season-comparison sub-blocks.

interface SeasonCmpProps {
  season: number;
  away: TeamMeta;
  home: TeamMeta;
  awayCity: string;
  awayName: string;
  homeCity: string;
  homeName: string;
  awayStanding: UfaStanding | null;
  homeStanding: UfaStanding | null;
  awayStats: UfaTeamStat | null;
  homeStats: UfaTeamStat | null;
}

interface ComparisonRow {
  label: string;
  away: string;
  home: string;
  /** Which side is better for highlighting; 'tie' or undefined for no highlight. */
  better?: 'away' | 'home' | 'tie' | null;
}

function buildComparisonRows(p: SeasonCmpProps): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  // Record (W-L-T)
  const aRec = p.awayStanding ? formatRecord(p.awayStanding) : null;
  const hRec = p.homeStanding ? formatRecord(p.homeStanding) : null;
  if (aRec || hRec) {
    rows.push({
      label: 'Record',
      away: aRec ?? '—',
      home: hRec ?? '—',
      better: p.awayStanding && p.homeStanding ? winsBetter(p.awayStanding, p.homeStanding) : null,
    });
  }

  // Point diff
  if (p.awayStanding || p.homeStanding) {
    rows.push({
      label: 'Pt diff',
      away: p.awayStanding ? signed(p.awayStanding.pointDiff) : '—',
      home: p.homeStanding ? signed(p.homeStanding.pointDiff) : '—',
      better:
        p.awayStanding && p.homeStanding
          ? p.awayStanding.pointDiff === p.homeStanding.pointDiff
            ? 'tie'
            : p.awayStanding.pointDiff > p.homeStanding.pointDiff
              ? 'away'
              : 'home'
          : null,
    });
  }

  // Team stats — totals from API
  const stat = (label: string, key: keyof UfaTeamStat, higherIsBetter = true) => {
    const av = numLike(p.awayStats?.[key]);
    const hv = numLike(p.homeStats?.[key]);
    if (av == null && hv == null) return;
    rows.push({
      label,
      away: av != null ? String(av) : '—',
      home: hv != null ? String(hv) : '—',
      better: better(av, hv, higherIsBetter),
    });
  };

  stat('Scores For', 'scoresFor');
  stat('Scores Against', 'scoresAgainst', false);
  stat('Blocks', 'blocks');
  stat('Turnovers', 'turnovers', false);
  stat('Games', 'gamesPlayed');

  return rows;
}

function formatRecord(s: UfaStanding): string {
  return s.ties > 0 ? `${s.wins}–${s.losses}–${s.ties}` : `${s.wins}–${s.losses}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function numLike(v: unknown): number | string | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isNaN(n) ? v : n;
  }
  return null;
}

function better(
  a: number | string | null,
  h: number | string | null,
  higherIsBetter: boolean,
): 'away' | 'home' | 'tie' | null {
  if (typeof a !== 'number' || typeof h !== 'number') return null;
  if (a === h) return 'tie';
  const awayWins = higherIsBetter ? a > h : a < h;
  return awayWins ? 'away' : 'home';
}

function winsBetter(a: UfaStanding, h: UfaStanding): 'away' | 'home' | 'tie' {
  const awayPct = a.wins / Math.max(1, a.wins + a.losses + a.ties);
  const homePct = h.wins / Math.max(1, h.wins + h.losses + h.ties);
  if (awayPct === homePct) return 'tie';
  return awayPct > homePct ? 'away' : 'home';
}

// ── Field variant ────────────────────────────────────────────────────────────

function FieldSeasonComparison(p: SeasonCmpProps) {
  const rows = buildComparisonRows(p);
  if (rows.length === 0) return null;

  return (
    <section
      aria-labelledby="season-cmp-heading"
      className="px-6 py-6 md:px-14 md:py-8 border-t border-hairline"
    >
      <h2
        id="season-cmp-heading"
        className="flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-4 pb-2 border-b border-hairline"
      >
        <span>Season · {p.season}</span>
        <span className="text-faint">Side-by-side</span>
      </h2>

      {/* Team header row */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted font-tight">
        <span className="truncate text-left">{p.awayCity} {p.awayName}</span>
        <span className="text-faint text-[10px]">vs</span>
        <span className="truncate text-right">{p.homeCity} {p.homeName}</span>
      </div>

      {/* Stat rows */}
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li
            key={r.label}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2 border-b border-hairline last:border-b-0"
          >
            <span
              className={`text-left tabular text-[18px] md:text-[22px] font-bold font-tight tracking-[-0.02em] ${
                r.better === 'away' ? 'text-ink' : r.better === 'home' ? 'text-faint' : 'text-muted'
              }`}
            >
              {r.away}
            </span>
            <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight whitespace-nowrap">
              {r.label}
            </span>
            <span
              className={`text-right tabular text-[18px] md:text-[22px] font-bold font-tight tracking-[-0.02em] ${
                r.better === 'home' ? 'text-ink' : r.better === 'away' ? 'text-faint' : 'text-muted'
              }`}
            >
              {r.home}
            </span>
          </li>
        ))}
      </ul>

      {/* Roster CTAs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
        <RosterCta team={p.away} city={p.awayCity} name={p.awayName} side="Away" />
        <RosterCta team={p.home} city={p.homeCity} name={p.homeName} side="Home" />
      </div>
    </section>
  );
}

function RosterCta({
  team,
  city,
  name,
  side,
}: {
  team: TeamMeta;
  city: string;
  name: string;
  side: 'Away' | 'Home';
}) {
  return (
    <Link
      href={`/teams/${team.id}`}
      className="group flex items-center justify-between gap-3 px-4 py-3.5 bg-surface border border-border hover:border-ink transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-2.5 h-8 rounded-[2px] flex-shrink-0"
          style={{ background: team.primary }}
          aria-hidden="true"
        />
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
            {side} · Roster
          </span>
          <span className="text-[14px] md:text-[15px] font-semibold text-ink font-tight truncate">
            {city} {name}
          </span>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase text-muted group-hover:text-accent transition-colors duration-150 font-tight whitespace-nowrap">
        View
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 7h8M7 3l4 4-4 4" />
        </svg>
      </span>
    </Link>
  );
}

// ── Per-game stat leaders ────────────────────────────────────────────────────
// Renders the 6 leader categories returned by /web-v1/game-stats.
// `leaders` is sometimes a stray number (e.g. when no one had any blocks);
// we guard for that by only rendering arrays.

interface GameLeadersProps {
  away: TeamMeta;
  home: TeamMeta;
  awayName: string;
  homeName: string;
  categories: UfaGameStatCategory[];
}

function FieldGameLeaders({ away, home, awayName, homeName, categories }: GameLeadersProps) {
  const rendered = categories.filter((c) => leaderArr(c.home).length > 0 || leaderArr(c.away).length > 0);
  if (rendered.length === 0) return null;

  return (
    <section
      aria-labelledby="game-leaders-heading"
      className="px-6 py-6 md:px-14 md:py-8 border-t border-hairline"
    >
      <h2
        id="game-leaders-heading"
        className="flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-5 pb-2 border-b border-hairline"
      >
        <span>Stat leaders · this game</span>
        <span className="text-faint">Top performers</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rendered.map((c) => (
          <FieldLeaderCard
            key={c.title}
            title={c.title}
            awayTeam={away}
            homeTeam={home}
            awayLeaders={leaderArr(c.away)}
            homeLeaders={leaderArr(c.home)}
            awayCount={c.away.count}
            homeCount={c.home.count}
          />
        ))}
      </div>
    </section>
  );
}

function FieldLeaderCard({
  title,
  awayTeam,
  homeTeam,
  awayLeaders,
  homeLeaders,
  awayCount,
  homeCount,
}: {
  title: string;
  awayTeam: TeamMeta;
  homeTeam: TeamMeta;
  awayLeaders: UfaGameStatLeader[];
  homeLeaders: UfaGameStatLeader[];
  awayCount: number;
  homeCount: number;
}) {
  const awayWins = awayLeaders.length > 0 && awayCount > homeCount;
  const homeWins = homeLeaders.length > 0 && homeCount > awayCount;
  return (
    <div className="bg-surface border border-border px-3 py-3.5 md:px-4 md:py-4 flex flex-col gap-3">
      <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight text-center">
        {title}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
        <FieldLeaderHalf team={awayTeam} side="Away" leaders={awayLeaders} count={awayCount} winning={awayWins} align="left" />
        <div className="w-px bg-hairline" aria-hidden="true" />
        <FieldLeaderHalf team={homeTeam} side="Home" leaders={homeLeaders} count={homeCount} winning={homeWins} align="right" />
      </div>
    </div>
  );
}

function FieldLeaderHalf({
  team,
  side,
  leaders,
  count,
  winning,
  align,
}: {
  team: TeamMeta;
  side: 'Away' | 'Home';
  leaders: UfaGameStatLeader[];
  count: number;
  winning: boolean;
  align: 'left' | 'right';
}) {
  const isLeft = align === 'left';
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${isLeft ? 'items-start text-left' : 'items-end text-right'}`}>
      <div className={`flex items-center gap-2 min-w-0 ${isLeft ? '' : 'flex-row-reverse'}`}>
        <TeamLogo team={team} size={22} className="rounded-[2px] flex-shrink-0" />
        <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight truncate">
          {side} · {team.abbr}
        </span>
      </div>
      <span className="text-[12px] font-semibold text-ink font-tight leading-tight w-full break-words">
        {leaders.length > 0
          ? leaders.map((l) => `${l.firstName} ${l.lastName}`).join(', ')
          : <span className="text-faint italic">No data</span>}
      </span>
      <span
        className={`tabular text-[26px] md:text-[28px] font-bold leading-none tracking-[-0.02em] font-tight mt-auto ${
          winning ? 'text-ink' : 'text-muted'
        }`}
      >
        {leaders.length > 0 ? count : '—'}
      </span>
    </div>
  );
}

function leaderArr(b: UfaGameStatCategory['away']): UfaGameStatLeader[] {
  return Array.isArray(b.leaders) ? b.leaders : [];
}

// ── Per-game team totals ─────────────────────────────────────────────────────
// Same comparison-row treatment as the season-comparison block but populated
// from /web-v1/game-stats's team-level totals (this game only).

interface GameTeamStatsProps {
  away: TeamMeta;
  home: TeamMeta;
  awayName: string;
  homeName: string;
  awayStats: UfaGameTeamStats;
  homeStats: UfaGameTeamStats;
}

interface TeamStatRow {
  label: string;
  away: string;
  home: string;
  awayRaw: number;
  homeRaw: number;
  higherIsBetter: boolean;
}

function buildTeamStatRows(p: GameTeamStatsProps): TeamStatRow[] {
  const a = p.awayStats;
  const h = p.homeStats;
  const pct = (made: number, att: number) => (att > 0 ? `${Math.round((made / att) * 100)}%` : '—');
  const pctRaw = (made: number, att: number) => (att > 0 ? made / att : 0);
  return [
    {
      label: 'Completions',
      away: `${a.completions} / ${a.throwingAttempts}`,
      home: `${h.completions} / ${h.throwingAttempts}`,
      awayRaw: pctRaw(a.completions, a.throwingAttempts),
      homeRaw: pctRaw(h.completions, h.throwingAttempts),
      higherIsBetter: true,
    },
    {
      label: 'Hucks',
      away: `${a.hucksCompleted} / ${a.hucksAttempted}`,
      home: `${h.hucksCompleted} / ${h.hucksAttempted}`,
      awayRaw: pctRaw(a.hucksCompleted, a.hucksAttempted),
      homeRaw: pctRaw(h.hucksCompleted, h.hucksAttempted),
      higherIsBetter: true,
    },
    { label: 'Blocks', away: String(a.blocks), home: String(h.blocks), awayRaw: a.blocks, homeRaw: h.blocks, higherIsBetter: true },
    { label: 'Turnovers', away: String(a.turnovers), home: String(h.turnovers), awayRaw: a.turnovers, homeRaw: h.turnovers, higherIsBetter: false },
    {
      label: 'O-line hold',
      away: pct(a.oLineScores, a.oLinePoints),
      home: pct(h.oLineScores, h.oLinePoints),
      awayRaw: pctRaw(a.oLineScores, a.oLinePoints),
      homeRaw: pctRaw(h.oLineScores, h.oLinePoints),
      higherIsBetter: true,
    },
    {
      label: 'D-line break',
      away: pct(a.dLineScores, a.dLinePoints),
      home: pct(h.dLineScores, h.dLinePoints),
      awayRaw: pctRaw(a.dLineScores, a.dLinePoints),
      homeRaw: pctRaw(h.dLineScores, h.dLinePoints),
      higherIsBetter: true,
    },
    {
      label: 'Red zone',
      away: pct(a.redZoneScores, a.redZonePossessions),
      home: pct(h.redZoneScores, h.redZonePossessions),
      awayRaw: pctRaw(a.redZoneScores, a.redZonePossessions),
      homeRaw: pctRaw(h.redZoneScores, h.redZonePossessions),
      higherIsBetter: true,
    },
  ];
}

function rowWinner(r: TeamStatRow): 'away' | 'home' | 'tie' {
  if (r.awayRaw === r.homeRaw) return 'tie';
  const awayWins = r.higherIsBetter ? r.awayRaw > r.homeRaw : r.awayRaw < r.homeRaw;
  return awayWins ? 'away' : 'home';
}

function FieldGameTeamStats(p: GameTeamStatsProps) {
  const rows = buildTeamStatRows(p);
  return (
    <section
      aria-labelledby="game-team-stats-heading"
      className="px-6 py-6 md:px-14 md:py-8 border-t border-hairline"
    >
      <h2
        id="game-team-stats-heading"
        className="flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-4 pb-2 border-b border-hairline"
      >
        <span>Team totals · this game</span>
        <span className="text-faint">{p.away.abbr} vs {p.home.abbr}</span>
      </h2>

      <ul className="flex flex-col">
        {rows.map((r) => {
          const win = rowWinner(r);
          return (
            <li
              key={r.label}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-2 border-b border-hairline last:border-b-0"
            >
              <span
                className={`text-left tabular text-[16px] md:text-[20px] font-bold font-tight tracking-[-0.02em] ${
                  win === 'away' ? 'text-ink' : win === 'home' ? 'text-faint' : 'text-muted'
                }`}
              >
                {r.away}
              </span>
              <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight whitespace-nowrap">
                {r.label}
              </span>
              <span
                className={`text-right tabular text-[16px] md:text-[20px] font-bold font-tight tracking-[-0.02em] ${
                  win === 'home' ? 'text-ink' : win === 'away' ? 'text-faint' : 'text-muted'
                }`}
              >
                {r.home}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

