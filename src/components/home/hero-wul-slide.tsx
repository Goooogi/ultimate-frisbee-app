// WUL hero slide — GameSlide layout (per Home v2 design spec), mirrors
// HeroPulSlide: dark #0E1622 base, two team-color radial glows, chalk field
// lines, top row eyebrow+status, center grid team columns, bottom row meta
// blocks + CTA. CTA links to /wul/g/{encoded id}. Server component.

import Link from 'next/link';
import type { WulGame, WulGameTeamSide } from '@/lib/wul/data';
import { WulTeamLogo } from '@/components/wul-team-logo';
import { HeroFieldLines } from './field-diagram';

const BASE = '#0E1622';
const TEXT = '#FFFFFF';
const TEXT_MUTED = 'rgba(255,255,255,0.65)';
const WUL_ACCENT = '#F5A623';

interface HeroWulSlideProps {
  game: WulGame;
}

export function HeroWulSlide({ game }: HeroWulSlideProps) {
  const isFinal = game.status === 'final';
  const href = `/wul/g/${wulGameHref(game.id)}`;
  const dateStr = game.gameDate ? formatDate(game.gameDate) : null;

  const awayGlow = game.away.accentColor ?? WUL_ACCENT;
  const homeGlow = game.home.accentColor ?? WUL_ACCENT;

  const awayWins =
    isFinal && game.away.score !== null && game.home.score !== null && game.away.score > game.home.score;
  const homeWins =
    isFinal && game.away.score !== null && game.home.score !== null && game.home.score > game.away.score;

  const weekDisplay = game.weekLabel === 'post' ? 'Postseason' : 'Regular Season';
  const eyebrowLabel = isFinal ? 'Final' : 'Up next';
  const whenLabel = !isFinal && dateStr ? dateStr.toUpperCase() : null;
  const statusLine = isFinal ? 'FINAL' : 'UPCOMING';

  return (
    <article
      className="relative h-full overflow-hidden px-5 sm:px-10 pt-[26px] sm:pt-[34px] pb-10 sm:pb-14 box-border flex flex-col justify-between"
      style={{ background: BASE, color: TEXT }}
    >
      <div
        className="absolute -top-[30%] -left-[8%] w-[55%] h-[150%] pointer-events-none"
        style={{ background: `radial-gradient(circle at 40% 50%, ${awayGlow}88, transparent 62%)` }}
        aria-hidden="true"
      />
      <div
        className="absolute -top-[30%] -right-[8%] w-[55%] h-[150%] pointer-events-none"
        style={{ background: `radial-gradient(circle at 60% 50%, ${homeGlow}88, transparent 62%)` }}
        aria-hidden="true"
      />
      <HeroFieldLines color="rgba(255,255,255,0.05)" accent={WUL_ACCENT} />

      <div className="relative flex-1 flex flex-col justify-between gap-4">
        {/* Top row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="inline-flex items-center gap-1.5 font-sans text-[10.5px] font-bold tracking-[0.12em] uppercase px-2.5 py-[5px] rounded-full flex-shrink-0"
              style={{ color: '#fff', background: WUL_ACCENT }}
            >
              ◆ WUL · {eyebrowLabel}
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

        {/* Center grid — extra horizontal padding beyond the card's own edge
            padding so team names never sit under the carousel's side-centered
            42px arrow buttons. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5 px-0 sm:px-8 lg:px-12">
          <WulGameTeam side={game.away} winner={awayWins} loser={homeWins} isFinal={isFinal} />
          <div className="flex flex-col items-center gap-1.5 sm:gap-2">
            <span className="font-display italic font-bold text-[26px] sm:text-[38px] leading-none" style={{ color: 'rgba(255,255,255,0.5)' }}>
              VS
            </span>
            <span className="font-mono text-[10px] sm:text-[11px] font-bold tracking-[0.14em]" style={{ color: WUL_ACCENT }}>
              {weekDisplay}
            </span>
          </div>
          <WulGameTeam side={game.home} winner={homeWins} loser={awayWins} isFinal={isFinal} align="right" />
        </div>

        {/* Bottom row */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap gap-6 sm:gap-8">
            <DarkMeta label="League" value="WUL" />
            <DarkMeta label="Status" value={isFinal ? 'Final' : 'Upcoming'} />
            {game.season && <DarkMeta label="Season" value={String(game.season)} />}
          </div>
          <div className="flex gap-2.5">
            <CTA href={href}>{isFinal ? 'Box score' : 'Preview'} →</CTA>
          </div>
        </div>
      </div>
    </article>
  );
}

function WulGameTeam({
  side,
  winner,
  loser,
  isFinal,
  align = 'left',
}: {
  side: WulGameTeamSide;
  winner: boolean;
  loser: boolean;
  isFinal: boolean;
  align?: 'left' | 'right';
}) {
  const right = align === 'right';
  const label = [side.city, side.mascot].filter(Boolean).join(' ') || side.abbrev;
  const teamForLogo = {
    id: side.teamId,
    abbr: side.abbrev,
    logoUrl: side.logoUrl,
    accentColor: side.accentColor,
  };
  return (
    <div
      className={`flex items-center gap-2.5 sm:gap-5 min-w-0 ${right ? 'flex-row-reverse text-right' : 'text-left'}`}
      style={{ opacity: loser ? 0.55 : 1 }}
    >
      <span className="inline-flex rounded-full overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.25)] flex-shrink-0 sm:hidden">
        <WulTeamLogo team={teamForLogo} size={56} />
      </span>
      <span className="hidden sm:inline-flex rounded-full overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.25)] flex-shrink-0">
        <WulTeamLogo team={teamForLogo} size={88} />
      </span>
      <div className="min-w-0">
        <div className="font-sans text-[11px] sm:text-[12px] font-bold tracking-[0.14em] uppercase truncate" style={{ color: TEXT_MUTED }}>
          {side.abbrev}
        </div>
        {isFinal && side.score !== null ? (
          <div
            className="font-display italic font-bold text-[32px] sm:text-[56px] leading-[0.9] tracking-[-0.03em] my-1 tabular"
            style={{ color: winner ? WUL_ACCENT : TEXT }}
          >
            {side.score}
          </div>
        ) : (
          <div className="font-display italic font-bold text-[24px] sm:text-[50px] leading-[0.9] tracking-[-0.03em] my-1 truncate pr-[0.14em] pb-[0.14em] -mb-[0.14em]">
            {label}
          </div>
        )}
        <span className="font-mono text-[11px] sm:text-[13px] font-medium truncate block" style={{ color: TEXT_MUTED }}>
          {isFinal ? label : ''}
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

function CTA({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 sm:py-3 rounded-full font-sans text-[12px] sm:text-[13px] font-bold tracking-[0.01em] cursor-pointer whitespace-nowrap transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(245,166,35,0.5)] bg-white/[0.12] text-white border border-white/[0.28]"
    >
      {children}
    </Link>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Build the href path for a WUL game id like "2026/2026-06-14/SD-vs-SEA".
 *  /wul/g/[...id] is a catch-all — preserve slashes as real path separators. */
function wulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
