// Featured game hero card — GameSlide layout per the Home v2 design spec:
// dark #0E1622 base, TWO team-color radial glows (one per side, using real
// UFA team colors), chalk field lines, top row = accent pill + datetime +
// status pill, center grid = away team | VS+week | home team, bottom row =
// three meta blocks (Venue/Week/Broadcast) + CTA pills.
//
// The caller picks the game via pickGameOfTheWeek() (lib/ufa/game-of-the-week).
// This component just renders whichever UfaGame it's handed.

import Link from 'next/link';
import type { UfaGame } from '@/lib/ufa/types';
import { teamMeta, type TeamMeta } from '@/lib/ufa/teams';
import { gameUiState, formatStartCompact } from '@/lib/ufa/format';
import { HeroFieldLines } from './field-diagram';
import { TeamLogo } from '@/components/team-logo';

interface HeroGameCardProps {
  game: UfaGame | undefined;
  awayRecord?: string;
  homeRecord?: string;
}

const BASE = '#0E1622';
const TEXT = '#FFFFFF';
const TEXT_MUTED = 'rgba(255,255,255,0.65)';
// Theme accent as a CSS-var reference so the hero's accent bits (live pill,
// week label, winning score) follow the active theme — coral on Field, lime
// on Broadcast — even though the card's bg is always-dark.
const ACCENT = 'rgb(var(--accent))';

/** Parse a 3- or 6-digit hex color to its [r,g,b] channels (0–255). */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Relative luminance (0–1) via the sRGB coefficients. Used only to decide
 *  whether a color is too dark to register against the dark base. */
function luminance([r, g, b]: [number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Below this luminance a team color is indistinguishable from the dark base
// (#0E1622 ≈ 0.02), so the glow would "collapse". Boston Glory's primary is
// pure black (#000000, lum 0) — the classic offender.
const MIN_GLOW_LUMINANCE = 0.14;

/** Pick the glow color for one team — prefer the team's real primary color
 *  (Hunter explicitly wants real UFA colors kept), but fall back to the
 *  team's accent when the primary is too dark to read against the base. */
function glowColor(team: TeamMeta): string {
  const p = hexToRgb(team.primary);
  if (luminance(p) >= MIN_GLOW_LUMINANCE) return team.primary;
  const a = hexToRgb(team.accent);
  return luminance(a) > luminance(p) ? team.accent : team.primary;
}

export function HeroGameCard({ game, awayRecord, homeRecord }: HeroGameCardProps) {
  if (!game) return <EmptyHero />;

  const away = teamMeta(game.awayTeamID);
  const home = teamMeta(game.homeTeamID);
  const state = gameUiState(game);
  const awayGlow = glowColor(away);
  const homeGlow = glowColor(home);

  const eyebrowLabel = state.isLive ? 'Live now' : state.isUpcoming ? 'Game of the week' : 'Recent result';
  const whenLabel = state.isUpcoming ? formatStartCompact(game).toUpperCase() : null;
  const statusLine = state.isLive ? 'LIVE' : state.isFinal ? 'FINAL' : 'UPCOMING';

  return (
    <article
      className="relative h-full overflow-hidden px-5 sm:px-10 pt-[26px] sm:pt-[34px] pb-10 sm:pb-14 box-border flex flex-col justify-between"
      style={{ background: BASE, color: TEXT }}
    >
      {/* Two team-color glows, one per side — real UFA team colors. Each is a
          wide horizontal (ellipse) gradient that carries its color well past
          the halfway line and fades out gradually, so the two OVERLAP and
          cross-blend through the center instead of both dying at ~50% and
          leaving a hard dark seam down the middle (the old radial-62% pair
          did exactly that on the narrow mobile card). */}
      <div
        className="absolute inset-y-0 -left-[10%] w-[75%] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 90% 120% at 22% 50%, ${awayGlow}88 0%, ${awayGlow}3d 45%, transparent 82%)`,
        }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-y-0 -right-[10%] w-[75%] pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 90% 120% at 78% 50%, ${homeGlow}88 0%, ${homeGlow}3d 45%, transparent 82%)`,
        }}
        aria-hidden="true"
      />
      <HeroFieldLines color="rgba(255,255,255,0.05)" accent={ACCENT} />

      <div className="relative flex-1 flex flex-col justify-between gap-4">
        {/* Top row — accent pill + datetime (left), status pill (right) */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold tracking-[0.12em] uppercase px-2.5 py-[5px] rounded-full flex-shrink-0"
              style={{ color: '#fff', background: ACCENT }}
            >
              ◆ {eyebrowLabel}
            </span>
            {whenLabel && (
              <span className="font-mono text-[12px] truncate" style={{ color: TEXT_MUTED }}>
                {whenLabel}
              </span>
            )}
          </div>
          <span
            className="font-sans text-[10.5px] font-bold tracking-[0.14em] uppercase px-2.5 py-[5px] rounded-full flex-shrink-0"
            style={{ color: TEXT_MUTED, background: 'rgba(255,255,255,0.1)' }}
          >
            {statusLine}
          </span>
        </div>

        {/* Center grid — away team | VS + week | home team. Extra horizontal
            padding beyond the card's own edge padding so team names never sit
            under the carousel's side-centered 42px arrow buttons. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5 px-0 sm:px-8 lg:px-12">
          <GameTeam
            slug={away.id}
            abbr={away.abbr}
            name={away.name ?? game.awayTeamName}
            rec={awayRecord ?? '—'}
          />
          <div className="flex flex-col items-center gap-1.5 sm:gap-2">
            <span
              className="font-display italic font-bold text-[26px] sm:text-[38px] leading-none"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              VS
            </span>
            <span
              className="font-mono text-[10px] sm:text-[11px] font-bold tracking-[0.14em]"
              style={{ color: ACCENT }}
            >
              {game.week ? game.week.replace(/^week-/i, 'WK ') : '—'}
            </span>
          </div>
          <GameTeam
            slug={home.id}
            abbr={home.abbr}
            name={home.name ?? game.homeTeamName}
            rec={homeRecord ?? '—'}
            align="right"
          />
        </div>

        {/* Bottom row — meta blocks (left) + CTAs (right) */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-6 sm:gap-8">
            <DarkMeta label="Venue" value={game.locationName ? truncate(game.locationName, 22) : '—'} />
            <DarkMeta label="Week" value={game.week ? game.week.replace(/^week-/i, 'Week ') : '—'} />
            <DarkMeta label="Broadcast" value="WatchUFA" />
          </div>
          <div className="flex gap-2.5">
            {game.streamingURL && (
              <CTA primary href={game.streamingURL} external>
                ▶ Watch live
              </CTA>
            )}
            <CTA href={`/g/${game.gameID}`}>
              {state.isUpcoming ? 'Preview' : 'Box score'} →
            </CTA>
          </div>
        </div>
      </div>
    </article>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function EmptyHero() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-5" style={{ background: BASE, color: TEXT }}>
      <span className="font-mono text-[11px] tracking-[0.18em]" style={{ color: TEXT_MUTED }}>
        OFFSEASON
      </span>
      <h2 className="font-display italic font-bold text-[40px] leading-[0.95] tracking-[-0.02em] m-0">
        No featured game today.
      </h2>
      <p className="text-[13px] max-w-md" style={{ color: TEXT_MUTED }}>
        The schedule is dark. Check back during UFA season — games run April through August.
      </p>
    </div>
  );
}

function GameTeam({
  slug,
  abbr,
  name,
  rec,
  align = 'left',
}: {
  slug: string;
  abbr: string;
  name: string;
  rec: string;
  align?: 'left' | 'right';
}) {
  const meta = teamMeta(slug);
  const right = align === 'right';
  return (
    <div
      className={`flex items-center gap-2.5 sm:gap-5 min-w-0 ${right ? 'flex-row-reverse text-right' : 'text-left'}`}
    >
      <span className="inline-flex rounded-full overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.25)] flex-shrink-0 sm:hidden">
        <TeamLogo team={meta} size={56} />
      </span>
      <span className="hidden sm:inline-flex rounded-full overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.25)] flex-shrink-0">
        <TeamLogo team={meta} size={88} />
      </span>
      <div className="min-w-0">
        <div
          className="font-sans text-[11px] sm:text-[12px] font-bold tracking-[0.14em] uppercase truncate"
          style={{ color: TEXT_MUTED }}
        >
          {abbr}
        </div>
        <div className="font-display italic font-bold text-[24px] sm:text-[50px] leading-[0.9] tracking-[-0.03em] my-1 truncate pr-[0.14em] pb-[0.14em] -mb-[0.14em]">
          {name}
        </div>
        <span className="font-mono text-[11px] sm:text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>
          {rec}
        </span>
      </div>
    </div>
  );
}

function DarkMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.1em]" style={{ color: TEXT_MUTED }}>
        {label}
      </div>
      <div className="font-sans text-[12.5px] sm:text-[14px] font-semibold mt-[3px] truncate" style={{ color: TEXT }}>
        {value}
      </div>
    </div>
  );
}

function CTA({
  children,
  primary,
  href,
  external,
}: {
  children: React.ReactNode;
  primary?: boolean;
  href: string;
  external?: boolean;
}) {
  // Primary CTA (Watch live) uses the theme ACCENT token so it follows the
  // active theme — coral on Field, lime on Broadcast — even though the hero
  // card's background is intentionally always-dark. accent-ink is the readable
  // on-accent text color per theme (white on coral, near-black on lime).
  const cls = primary
    ? 'bg-accent text-accent-ink'
    : 'bg-white/[0.12] text-white border border-white/[0.28]';
  const cls2 =
    'inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full font-sans text-[12px] sm:text-[13px] font-bold tracking-[0.01em] cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`${cls} ${cls2}`}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={`${cls} ${cls2}`}>
      {children}
    </Link>
  );
}
