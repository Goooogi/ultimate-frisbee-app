'use client';

// Shared pro game-detail "Player Spotlight" section. Renders one player per team
// side by side, flipping its heading + content by game state:
//
//   • upcoming / live  → "Players to watch"   (season-best per team)
//   • final            → "Player of the game"  (this game's best per team)
//
// League-agnostic: each caller (UFA / PUL / WUL) resolves its own picks via
// lib/pro/player-spotlight and passes an already-rendered team logo node, so
// this component needs no league-specific team types. Matches the visual
// language of the existing stat-leader cards (logo + uppercase side label +
// name + big stat line). Renders nothing when neither side resolves a player.

import { useId, useState } from 'react';
import Link from 'next/link';
import type { SpotlightPlayer } from '@/lib/pro/player-spotlight';

export interface SpotlightSide {
  /** Team abbreviation, e.g. "SD". */
  abbr: string;
  /** Pre-rendered team logo (each league brings its own logo component). */
  logo: React.ReactNode;
  /** The resolved pick for this side, or null (no usable data). */
  player: SpotlightPlayer | null;
}

interface Props {
  /** true → "Player of the game" (final); false → "Players to watch". */
  isFinal: boolean;
  away: SpotlightSide;
  home: SpotlightSide;
  /** UFA renders this as a full-bleed section inside its surface card (default:
   *  top hairline + section padding). PUL/WUL wrap it in their own card, so they
   *  pass "bare" to drop the border + outer padding and avoid double chrome. */
  variant?: 'section' | 'bare';
}

export function PlayerSpotlightSection({ isFinal, away, home, variant = 'section' }: Props) {
  const headingId = useId();
  // Nothing to show on either side → don't render an empty shell.
  if (!away.player && !home.player) return null;

  const heading = isFinal ? 'Player of the game' : 'Players to watch';
  const eyebrow = isFinal ? 'Top performer' : 'One to watch';
  const bare = variant === 'bare';

  return (
    <section
      aria-labelledby={headingId}
      className={bare ? '' : 'px-6 py-6 md:px-14 md:py-8 border-t border-hairline'}
    >
      {/* Heading grammar matches the host page's own stat-leaders heading:
          UFA (section) uses the small-caps eyebrow with a bottom hairline;
          PUL/WUL (bare) use their display-italic section headers. */}
      <h2
        id={headingId}
        className={
          bare
            ? 'flex items-baseline justify-between gap-4 mb-4'
            : 'flex items-baseline justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-5 pb-2 border-b border-hairline'
        }
      >
        <span className={bare ? 'font-display italic font-bold text-[20px] md:text-[24px] leading-[0.95] tracking-[-0.02em] text-ink' : undefined}>
          {heading}
        </span>
        <span className={bare ? 'text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint' : 'text-faint'}>
          {eyebrow}
        </span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SpotlightCard side={away} label="Away" variant={variant} />
        <SpotlightCard side={home} label="Home" variant={variant} />
      </div>
    </section>
  );
}

function SpotlightCard({
  side,
  label,
  variant,
}: {
  side: SpotlightSide;
  label: 'Away' | 'Home';
  variant: 'section' | 'bare';
}) {
  const p = side.player;
  const bare = variant === 'bare';
  // Fall back to the initials monogram if the headshot fails to load (a stale /
  // 404'd URL) instead of showing a broken-image glyph.
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!p?.headshotUrl && !imgFailed;

  const inner = (
    <div className="flex items-center gap-3.5 min-w-0">
      <span className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-ink/5 ring-1 ring-hairline flex items-center justify-center">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p!.headshotUrl!}
            alt={p!.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="font-display italic font-bold text-[15px] text-muted" aria-hidden="true">
            {p ? initials(p.name) : '—'}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 shrink-0">
            <span className="w-4 h-4 inline-flex items-center justify-center">{side.logo}</span>
            <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              {label} · {side.abbr}
            </span>
          </span>
        </div>
        {p ? (
          <>
            <div className="text-[15px] font-bold text-ink font-tight truncate mt-0.5 group-hover:text-accent transition-colors">
              {p.name}
            </div>
            <div className="text-[12px] font-semibold text-muted font-tight tabular mt-0.5 truncate">
              {p.statLine}
              {p.sub && <span className="text-faint font-medium"> · {p.sub}</span>}
            </div>
          </>
        ) : (
          <div className="text-[13px] text-faint italic font-tight mt-1">No data</div>
        )}
      </div>
    </div>
  );

  // Tile elevation matches the host page's own player tiles:
  //  • section (UFA) → recessed inside the page's surface card: bg-bg + rounded-card-sm
  //    (mirrors FieldLeaderCard).
  //  • bare (PUL/WUL) → elevated straight on the warm page canvas: bg-surface +
  //    shadow-card + rounded-card (mirrors those pages' LeaderCard).
  const base = bare
    ? 'group block bg-surface rounded-card shadow-card px-4 py-3.5'
    : 'group block bg-bg rounded-card-sm px-4 py-3.5';

  // Link to the unified profile when we resolved an id; otherwise a plain card.
  if (p?.profileId) {
    return (
      <Link
        href={`/players/${p.profileId}`}
        className={[
          base,
          'hover:bg-surface-hi transition-colors cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
