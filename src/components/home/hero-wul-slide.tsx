// WUL hero slide — two-team matchup card, mirrors HeroPulSlide.
// Per-league accent: WUL orange/amber. CTA links to /wul/g/{encoded id}.
// Server component.

import Link from 'next/link';
import type { WulGame } from '@/lib/wul/data';
import { WulTeamLogo } from '@/components/wul-team-logo';
import { HeroFieldLines } from './field-diagram';

const STADIUM = {
  bg: '#1A1205',
  line: 'rgba(255,230,160,0.06)',
  text: '#FFF5E0',
  textMuted: 'rgba(255,230,160,0.55)',
};
// WUL accent: amber/gold
const WUL_ACCENT = '#F5A623';
const WUL_ACCENT_STR = 'rgba(245,166,35,1)';

interface HeroWulSlideProps {
  game: WulGame;
}

export function HeroWulSlide({ game }: HeroWulSlideProps) {
  const isFinal = game.status === 'final';
  const href = `/wul/g/${wulGameHref(game.id)}`;
  const dateStr = game.gameDate ? formatDate(game.gameDate) : null;

  const awayColor = game.away.accentColor ?? '#2E2005';
  const homeColor = game.home.accentColor ?? '#1A1205';

  const background = [
    'linear-gradient(180deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.06) 42%, rgba(0,0,0,0.44) 100%)',
    `radial-gradient(120% 130% at 0% 50%, ${hexOrFallback(awayColor, 0.7)} 0%, transparent 55%)`,
    `radial-gradient(120% 130% at 100% 50%, ${hexOrFallback(homeColor, 0.7)} 0%, transparent 55%)`,
    STADIUM.bg,
  ].join(', ');

  const awayWins = isFinal &&
    game.away.score !== null &&
    game.home.score !== null &&
    game.away.score > game.home.score;
  const homeWins = isFinal &&
    game.away.score !== null &&
    game.home.score !== null &&
    game.home.score > game.away.score;

  const weekDisplay = game.weekLabel === 'post' ? 'Postseason' : 'Regular Season';
  const eyebrowStatus = isFinal ? 'FINAL' : dateStr ? dateStr.toUpperCase() : 'UPCOMING';
  const eyebrowLabel = isFinal
    ? `WUL · ${weekDisplay}`
    : `WUL · ${weekDisplay} · ${dateStr ?? 'TBD'}`;

  return (
    <article
      className="relative overflow-hidden p-5 sm:p-9 lg:min-h-[480px] flex flex-col justify-between"
      style={{ background, color: STADIUM.text }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(70% 55% at 50% 0%, rgba(245,166,35,0.10), transparent 60%)',
        }}
        aria-hidden="true"
      />
      <HeroFieldLines color={STADIUM.line} accent={WUL_ACCENT} />

      <div className="relative flex-1 flex flex-col justify-between gap-5">
        {/* Eyebrow */}
        <div>
          <div className="inline-flex items-center gap-2.5 mb-2">
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: WUL_ACCENT_STR, boxShadow: `0 0 0 3px rgba(245,166,35,0.20)` }}
            />
            <span
              className="font-mono text-[11px] font-bold tracking-[0.14em]"
              style={{ color: WUL_ACCENT }}
            >
              {eyebrowStatus}
            </span>
          </div>
          <div
            className="font-sans text-[10.5px] font-bold tracking-[0.18em] uppercase"
            style={{ color: STADIUM.textMuted }}
          >
            {eyebrowLabel}
          </div>
        </div>

        {/* Matchup */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 sm:gap-7 items-center my-3">
          <WulTeamColumn
            side={game.away}
            winner={awayWins}
            loser={homeWins}
            isFinal={isFinal}
            align="left"
          />
          {!isFinal ? (
            <div
              className="font-display italic font-semibold text-[22px]"
              style={{ color: STADIUM.textMuted }}
            >
              vs
            </div>
          ) : (
            <div aria-hidden="true" />
          )}
          <WulTeamColumn
            side={game.home}
            winner={homeWins}
            loser={awayWins}
            isFinal={isFinal}
            align="right"
          />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div className="flex flex-wrap gap-7">
            <StatMini label="League" value="WUL" />
            <StatMini label="Status" value={isFinal ? 'Final' : 'Upcoming'} />
            {game.season && (
              <StatMini label="Season" value={String(game.season)} />
            )}
          </div>
          <Link
            href={href}
            className={[
              'inline-flex items-center gap-2 px-4 py-2.5',
              'font-sans text-[11px] font-bold tracking-[0.12em] uppercase',
              'cursor-pointer transition-opacity hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(245,166,35,0.5)]',
              'bg-[rgba(255,230,160,0.10)] text-[#FFF5E0] border border-[rgba(255,230,160,0.18)]',
            ].join(' ')}
          >
            {isFinal ? 'Box score' : 'Preview'} →
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

import type { WulGameTeamSide } from '@/lib/wul/data';

function WulTeamColumn({
  side,
  winner,
  loser,
  isFinal,
  align,
}: {
  side: WulGameTeamSide;
  winner: boolean;
  loser: boolean;
  isFinal: boolean;
  align: 'left' | 'right';
}) {
  const isRight = align === 'right';
  const label = [side.city, side.mascot].filter(Boolean).join(' ') || side.abbrev;
  const teamForLogo = {
    id: side.teamId,
    abbr: side.abbrev,
    logoUrl: side.logoUrl,
    accentColor: side.accentColor,
  };

  return (
    <div
      className={`flex flex-col gap-2 ${isRight ? 'items-end text-right' : 'items-start text-left'} transition-opacity`}
      style={{ opacity: loser ? 0.55 : 1 }}
    >
      <div className={`flex items-center gap-2.5 ${isRight ? 'flex-row-reverse' : ''}`}>
        <WulTeamLogo team={teamForLogo} size={36} />
        <div>
          <div className="font-display italic font-bold text-[18px] tracking-[-0.02em]">{side.abbrev}</div>
        </div>
      </div>
      {isFinal && side.score !== null && (
        <div
          className="font-display italic font-bold text-[52px] sm:text-[72px] lg:text-[96px] leading-[0.95] tracking-[-0.04em] tabular"
          style={{ color: winner ? WUL_ACCENT : STADIUM.text }}
        >
          {side.score}
        </div>
      )}
      <div
        className={`font-sans text-[11px] font-medium${!isFinal ? ' hidden sm:block' : ''}`}
        style={{ color: STADIUM.textMuted }}
      >
        {label}
      </div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.1em] uppercase" style={{ color: STADIUM.textMuted }}>
        {label}
      </div>
      <div
        className="font-display italic font-bold text-[20px] lg:text-[22px] mt-0.5"
        style={{ color: STADIUM.text }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function hexOrFallback(color: string, alpha: number): string {
  if (!color) return `rgba(42,28,5,${alpha})`;
  if (color.startsWith('rgb')) return color.replace(/rgba?\([^)]+\)/, (m) => {
    const nums = m.replace(/rgba?\(/, '').replace(')', '').split(',').map((n) => n.trim());
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
  });
  const hex = color.replace('#', '');
  const full = hex.length === 3
    ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    : hex;
  if (full.length !== 6) return `rgba(42,28,5,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Build the href path for a WUL game id like "2026/2026-06-14/SD-vs-SEA".
 *  /wul/g/[...id] is a catch-all — preserve slashes as real path separators. */
function wulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
