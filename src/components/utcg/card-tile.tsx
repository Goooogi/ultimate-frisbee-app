'use client';

// CardTile — the single reusable "player card" visual, shared by the
// Collection grid and the squad-builder's field/slot-picker. Follows the
// authoritative UTCG design suite's compact "SquadCard" anatomy (Claude
// Design project, utcg-squad-app.jsx .scard/.sc-*): OVR + rarity dot top,
// position label, photo, name, team, and a rarity-colored bar along the
// bottom — with a rarity-tinted inset ring + top glow driving the whole
// card's silhouette so tier reads at grid-scan distance. `greatest` alone
// gets the full gold foil face (utcg-shared.jsx GOLD_FACE); every other tier
// is a normal surface tinted by its RARITY hex.
//
// Photo area: the mocks use a placeholder "photo" block; here that's real
// team colors — a team-color wash + ghosted team-mark watermark, headshot
// bottom-anchored when available, else a monogram.

import { useState, useEffect } from 'react';
import type { UtcgCard } from '@/lib/utcg/data';
import type { CardTier } from '@/lib/utcg/packs';
import { TIERS } from '@/lib/utcg/packs';

// RARITY scale — one hex per tier, used for ring/glow/bar/dots everywhere a
// card or tier shows up (CardTile, pack store guarantees, pack reveal, squad
// field chem tags). Source of truth: Claude Design project utcg-shared.jsx.
// Mapped 1:1 to this codebase's CardTier keys (fringe/avg/contrib/solid/
// star/elite/goat in the mock == fringe/leagueAvg/contributor/solidPro/star/
// elite/greatest here). Literal hex, not theme tokens — intentional: rarity
// materials must render identically in both themes, like real foil.
export const RARITY: Record<CardTier, { label: string; c: string }> = {
  fringe: { label: 'Fringe', c: '#8B8B86' },
  leagueAvg: { label: 'League Average', c: '#9AA3B2' },
  contributor: { label: 'Contributor', c: '#2AA79B' },
  solidPro: { label: 'Solid Pro', c: '#3FA85C' },
  star: { label: 'Star', c: '#4D7DFF' },
  elite: { label: 'All-Time Elite', c: '#9061F9' },
  greatest: { label: 'All-Time Greatest', c: '#F5C451' },
};

export const GOLD_FACE = 'linear-gradient(155deg,#F8DA80,#E9B23B 45%,#F5C451 70%,#C98F1F)';
export const GOLD_BAR = 'linear-gradient(90deg,#4A3606,#8a6a1c)';
export const GOLD_TEXT = '#241A04';

export function tierLabel(tier: CardTier): string {
  return TIERS.find((t) => t.key === tier)?.label ?? RARITY[tier]?.label ?? 'Fringe';
}

/** Rarity-tinted badge className. Non-greatest tiers use a shared neutral
 *  chip (Tailwind can't interpolate runtime hex into an arbitrary-value
 *  class) — pair with tierDotStyle() for the colored dot that actually
 *  carries the rarity signal, matching the mock's "dot + label" badge. */
export function tierBadgeClasses(tier: CardTier): string {
  if (tier === 'greatest') return 'bg-[#F5C451] text-[#241A04]';
  return 'bg-ink/5 text-ink/70';
}

/** Colored dot companion to tierBadgeClasses (mock: .cf-dot / .sc-dot / .grt-dot). */
export function tierDotStyle(tier: CardTier): React.CSSProperties {
  return { background: tier === 'greatest' ? GOLD_TEXT : RARITY[tier].c };
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function positionLabel(position: UtcgCard['position']): string {
  if (position === 'handler') return 'HANDLER';
  if (position === 'cutter') return 'CUTTER';
  return 'HYBRID';
}

// Photo area (mock: .sc-photo) — team-color wash + ghosted team-mark
// watermark behind a bottom-anchored headshot, else a monogram. Local error
// state resets whenever the src changes, matching PlayerHeadshot's
// onError-fallback pattern. `compact` renders a shorter strip (wider aspect
// ratio) for dense contexts like the squad field's fixed 92x120 slots, where
// the full 4:3 photo plus all the surrounding text rows wouldn't fit.
function CardPhoto({ card, gold, compact }: { card: UtcgCard; gold: boolean; compact: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [card.headshotUrl]);

  const showPhoto = card.headshotUrl && !failed;

  return (
    <div
      className="relative w-full overflow-hidden rounded-card-sm flex-shrink-0"
      style={{ background: card.primary, aspectRatio: compact ? '16 / 7' : '3 / 4' }}
    >
      <span
        className="absolute inset-0"
        style={{ background: `linear-gradient(155deg, transparent 35%, ${card.accent}55 100%)` }}
        aria-hidden="true"
      />
      <span className="absolute -bottom-2 -right-2 pointer-events-none" aria-hidden="true">
        {card.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.logo} alt="" className={`${compact ? 'w-9 h-9' : 'w-14 h-14'} object-contain opacity-[0.16] brightness-0 invert`} />
        ) : (
          <span className="font-display italic font-bold text-white opacity-[0.14] leading-none" style={{ fontSize: compact ? 26 : 44 }}>
            {card.teamAbbr}
          </span>
        )}
      </span>

      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.headshotUrl!}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover ${compact ? 'object-[center_20%]' : 'object-[center_28%]'}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className={`absolute inset-0 flex items-center justify-center font-display italic font-bold ${gold ? '' : 'text-white/90'}`}
          style={{ fontSize: compact ? 13 : 22, color: gold ? 'rgba(36,26,4,0.55)' : undefined }}
        >
          {initialsOf(card.name)}
        </span>
      )}

      {/* Season stat line — a translucent bar over the BOTTOM of the photo
          (jersey/shoulders, well clear of the face at object-[center_28%]) so
          it adds no card height. Full cards only (the compact strip has no
          room), and only when there's a real stat line — draft cards and truly
          statless players come through all-zero, so we skip the bar rather than
          show a meaningless 0/0/0/0. */}
      {!compact && (card.goals || card.assists || card.blocks || card.plusMinus) ? (
        <StatBar card={card} />
      ) : null}
    </div>
  );
}

// Translucent G/A/B/± overlay pinned to the photo's bottom edge.
function StatBar({ card }: { card: UtcgCard }) {
  const pm = card.plusMinus;
  const stats: { k: string; v: string }[] = [
    { k: 'G', v: String(card.goals) },
    { k: 'A', v: String(card.assists) },
    { k: 'B', v: String(card.blocks) },
    { k: '+/-', v: pm > 0 ? `+${pm}` : String(pm) },
  ];
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-around px-1.5 py-1 backdrop-blur-[2px]"
      style={{ background: 'linear-gradient(to top, rgba(10,12,16,0.82), rgba(10,12,16,0.62) 60%, transparent)' }}
      aria-hidden="true"
    >
      {stats.map((s) => (
        <span key={s.k} className="flex items-baseline gap-0.5 leading-none">
          <span className="text-[7px] font-bold tracking-[0.04em] uppercase text-white/55">{s.k}</span>
          <span className="text-[11px] font-display italic font-bold tabular text-white">{s.v}</span>
        </span>
      ))}
    </div>
  );
}

interface CardTileProps {
  card: UtcgCard;
  copies?: number;
  onClick?: () => void;
  selected?: boolean;
  /** Disable interaction (e.g. already placed elsewhere in the squad). */
  disabled?: boolean;
  className?: string;
  /** Out-of-position placement (mock: .sc-off) — dims the card and shows an
   *  "OFF ROLE" ribbon; used by the squad builder when a card is placed in a
   *  slot it doesn't naturally fit (earns zero chemistry). */
  offRole?: boolean;
  /** Tighter type scale + a shorter photo strip, for dense fixed-size
   *  contexts (the squad field's 92x120 slots) where the default sizing
   *  would overflow its box. Collection grid / slot picker use the default. */
  compact?: boolean;
}

export function CardTile({ card, copies, onClick, selected = false, disabled = false, className = '', offRole = false, compact = false }: CardTileProps) {
  const interactive = typeof onClick === 'function';
  const rarity = RARITY[card.tier];
  const gold = card.tier === 'greatest';

  const inner = (
    <div className={['flex flex-col w-full', compact ? 'gap-1 p-1.5' : 'gap-1.5 p-2.5'].join(' ')}>
      <div className="flex items-start justify-between gap-1">
        <p className={`font-display italic font-bold tabular leading-none ${compact ? 'text-base' : 'text-xl'}`} style={{ color: gold ? GOLD_TEXT : undefined }}>
          <span className={gold ? '' : 'text-ink'}>{card.playerScore.toFixed(0)}</span>
        </p>
        <span className="w-1.5 h-1.5 rounded-full mt-0.5 flex-shrink-0" style={tierDotStyle(card.tier)} aria-hidden="true" />
      </div>
      {!compact && (
        <p className={`text-[7px] font-bold tracking-[0.1em] uppercase leading-none -mt-1 ${gold ? '' : 'text-faint'}`} style={{ color: gold ? 'rgba(36,26,4,0.7)' : undefined }}>
          {positionLabel(card.position)}
        </p>
      )}

      {/* Photo block — a real sized box (not flex-1, which collapses to 0
          height without a height-constrained ancestor). Matches the mock's
          .sc-photo proportions: a short strip in compact/field contexts,
          taller (4:3) in grid/picker contexts. */}
      <CardPhoto card={card} gold={gold} compact={compact} />

      <p className={`font-display italic font-bold leading-none truncate pr-[0.14em] ${compact ? 'text-[12px]' : 'text-[15px]'}`} style={{ color: gold ? GOLD_TEXT : undefined }}>
        <span className={gold ? '' : 'text-ink'}>{card.name}</span>
      </p>
      {!compact && (
        <div className="flex items-center justify-between gap-1">
          <span
            className="text-[6.5px] font-bold tracking-[0.08em] uppercase truncate leading-none"
            style={{ color: gold ? 'rgba(36,26,4,0.7)' : undefined }}
          >
            <span className={gold ? '' : 'text-faint'}>{card.teamAbbr} · {card.year}</span>
          </span>
          {copies !== undefined && copies > 1 && (
            <span
              className="text-[7px] font-bold tabular px-1 py-0.5 rounded-full leading-none flex-shrink-0"
              style={{ background: gold ? 'rgba(0,0,0,0.15)' : undefined, color: gold ? GOLD_TEXT : undefined }}
            >
              <span className={gold ? '' : 'bg-ink/5 text-faint rounded-full px-0 py-0'}>×{copies}</span>
            </span>
          )}
        </div>
      )}

      {/* Rarity bar */}
      <span
        className={`w-full rounded-full flex-shrink-0 ${compact ? 'h-[3px]' : 'h-1 mt-0.5'}`}
        style={{ background: gold ? GOLD_BAR : rarity.c }}
        aria-hidden="true"
      />

      {offRole && (
        <span className="absolute inset-x-0 bottom-0 bg-[rgba(122,106,58,0.9)] text-white text-[6.5px] font-extrabold tracking-[0.12em] text-center py-1 rounded-b-card">
          OFF ROLE
        </span>
      )}
    </div>
  );

  const sharedClasses = [
    'utcg-card-face relative rounded-card text-left w-full overflow-hidden',
    gold ? '' : 'bg-surface',
    'shadow-card motion-safe:transition-shadow motion-safe:duration-150',
    offRole ? 'opacity-50' : '',
    selected ? 'ring-2 ring-accent shadow-lift' : '',
    className,
  ].join(' ');

  // Rarity ring + top glow — inset box-shadow so it never fights the app's
  // shadow-only elevation rule (no literal border). Greatest gets the full
  // gold face instead (rendered as a background layer beneath the content).
  const rarityShadow: React.CSSProperties = gold
    ? {}
    : { boxShadow: `inset 0 0 0 1.5px ${rarity.c}, inset 0 40px 46px -40px ${rarity.c}66` };

  const goldFace = gold ? (
    <span className="absolute inset-0 pointer-events-none" style={{ background: GOLD_FACE }} aria-hidden="true" />
  ) : null;

  if (!interactive) {
    return (
      <div className={sharedClasses} style={rarityShadow}>
        {goldFace}
        <span className="relative z-10 flex h-full">{inner}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${card.name}, ${card.teamAbbr} ${card.year}, score ${card.playerScore.toFixed(0)}${offRole ? ', out of position' : ''}`}
      style={rarityShadow}
      className={[
        sharedClasses,
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-lift cursor-pointer',
      ].join(' ')}
    >
      {goldFace}
      <span className="relative z-10 flex h-full">{inner}</span>
    </button>
  );
}
