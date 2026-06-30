// PUL hero slide — two-team matchup card.
// Stadium feel matching HeroGameCard, but with a PUL-specific accent (teal/gold).
// CTA links to /pul/g/{encoded id}.
// Server component — no 'use client' needed.

import Link from 'next/link';
import type { PulGame } from '@/lib/pul/data';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { HeroFieldLines } from './field-diagram';

const STADIUM = {
  bg: '#0D1A17',
  line: 'rgba(200,240,220,0.06)',
  text: '#E8F5EE',
  textMuted: 'rgba(200,240,220,0.55)',
};
// PUL accent: emerald green
const PUL_ACCENT = '#1EC98B';
const PUL_ACCENT_STR = 'rgba(30,201,139,1)';

interface HeroPulSlideProps {
  game: PulGame;
}

export function HeroPulSlide({ game }: HeroPulSlideProps) {
  const isFinal = game.status === 'final';
  const href = `/pul/g/${pulGameHref(game.id)}`;
  const dateStr = game.gameDate ? formatDate(game.gameDate) : null;

  // Build two-tone team gradient, mirroring HeroGameCard's pool pattern.
  const awayColor = game.away.accentColor ?? '#1A3A2E';
  const homeColor = game.home.accentColor ?? '#0D2820';

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

  const eyebrowStatus = isFinal ? 'FINAL' : dateStr ? dateStr.toUpperCase() : 'UPCOMING';
  const eyebrowLabel = isFinal
    ? `PUL · ${game.weekLabel}`
    : `PUL · ${game.weekLabel} · ${dateStr ?? 'TBD'}`;

  // Adapt team shape to PulTeamLogo expected prop (needs 'name' = city+mascot)
  const awayTeamForLogo = {
    id: game.away.teamId,
    name: [game.away.city, game.away.mascot].filter(Boolean).join(' ') || game.away.abbrev,
    city: game.away.city ?? '',
    mascot: game.away.mascot ?? game.away.abbrev,
    logoUrl: game.away.logoUrl,
    accentColor: game.away.accentColor,
  };
  const homeTeamForLogo = {
    id: game.home.teamId,
    name: [game.home.city, game.home.mascot].filter(Boolean).join(' ') || game.home.abbrev,
    city: game.home.city ?? '',
    mascot: game.home.mascot ?? game.home.abbrev,
    logoUrl: game.home.logoUrl,
    accentColor: game.home.accentColor,
  };

  return (
    <article
      className="relative overflow-hidden p-5 sm:p-9 lg:min-h-[480px] flex flex-col justify-between"
      style={{ background, color: STADIUM.text }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(70% 55% at 50% 100%, rgba(30,201,139,0.10), transparent 60%)',
        }}
        aria-hidden="true"
      />
      <HeroFieldLines color={STADIUM.line} accent={PUL_ACCENT} />

      <div className="relative flex-1 flex flex-col justify-between gap-5">
        {/* Eyebrow */}
        <div>
          <div className="inline-flex items-center gap-2.5 mb-2">
            <span
              className="w-[7px] h-[7px] rounded-full"
              style={{ background: PUL_ACCENT_STR, boxShadow: `0 0 0 3px rgba(30,201,139,0.20)` }}
            />
            <span
              className="font-mono text-[11px] font-bold tracking-[0.14em]"
              style={{ color: PUL_ACCENT }}
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
          <PulTeamColumn
            team={awayTeamForLogo}
            abbrev={game.away.abbrev}
            score={game.away.score}
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
          <PulTeamColumn
            team={homeTeamForLogo}
            abbrev={game.home.abbrev}
            score={game.home.score}
            winner={homeWins}
            loser={awayWins}
            isFinal={isFinal}
            align="right"
          />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap justify-between items-end gap-4">
          <div className="flex flex-wrap gap-7">
            <StatMini label="League" value="PUL" />
            <StatMini label="Status" value={isFinal ? 'Final' : 'Upcoming'} />
            {game.location && (
              <StatMini label="Venue" value={truncate(game.location, 22)} />
            )}
          </div>
          <Link
            href={href}
            className={[
              'inline-flex items-center gap-2 px-4 py-2.5',
              'font-sans text-[11px] font-bold tracking-[0.12em] uppercase',
              'cursor-pointer transition-opacity hover:opacity-90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(30,201,139,0.5)]',
              'bg-[rgba(200,240,220,0.10)] text-[#E8F5EE] border border-[rgba(200,240,220,0.18)]',
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

function PulTeamColumn({
  team,
  abbrev,
  score,
  winner,
  loser,
  isFinal,
  align,
}: {
  team: { id: string; name: string; city: string; mascot: string; logoUrl: string | null; accentColor: string | null };
  abbrev: string;
  score: number | null;
  winner: boolean;
  loser: boolean;
  isFinal: boolean;
  align: 'left' | 'right';
}) {
  const ACCENT = PUL_ACCENT;
  const isRight = align === 'right';
  const label = [team.city, team.mascot].filter(Boolean).join(' ') || abbrev;

  return (
    <div
      className={`flex flex-col gap-2 ${isRight ? 'items-end text-right' : 'items-start text-left'} transition-opacity`}
      style={{ opacity: loser ? 0.55 : 1 }}
    >
      <div className={`flex items-center gap-2.5 ${isRight ? 'flex-row-reverse' : ''}`}>
        <PulTeamLogo team={team} size={36} />
        <div>
          <div className="font-display italic font-bold text-[18px] tracking-[-0.02em]">{abbrev}</div>
        </div>
      </div>
      {isFinal && score !== null && (
        <div
          className="font-display italic font-bold text-[52px] sm:text-[72px] lg:text-[96px] leading-[0.95] tracking-[-0.04em] tabular"
          style={{ color: winner ? ACCENT : STADIUM.text }}
        >
          {score}
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

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** Convert a hex or rgb(a) string to rgba with the given alpha for a gradient stop.
 *  If it's already rgb/rgba just wraps; if hex, converts. Fallback: a dark neutral. */
function hexOrFallback(color: string, alpha: number): string {
  if (!color) return `rgba(30,42,36,${alpha})`;
  // Already a CSS function → wrap with alpha
  if (color.startsWith('rgb')) return color.replace(/rgba?\([^)]+\)/, (m) => {
    const nums = m.replace(/rgba?\(/, '').replace(')', '').split(',').map((n) => n.trim());
    return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
  });
  // Hex → rgb
  const hex = color.replace('#', '');
  const full = hex.length === 3
    ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
    : hex;
  if (full.length !== 6) return `rgba(30,42,36,${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Build the href segments for a PUL game id like "2026/finals/PHL-vs-DC".
 *  /pul/g/[...id] is a catch-all — preserve slashes as real separators. */
function pulGameHref(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
