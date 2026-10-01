'use client';

// PackOpenAnimation — THE CENTERPIECE. Full-screen takeover matching the
// authoritative mock (utcg-pack-app.jsx / pack-opening.css): closed foil pack
// → tear (particle burst) → sequential one-at-a-time card reveal (flip timed
// per-index by ANT/FLIP, escalating dim/rays/shake for the jackpot) →
// summary. Honors prefers-reduced-motion throughout (instant reveal, no
// flip/tear/particles).
//
// Card faces reuse the same rarity-material language as CardTile (RARITY
// scale, gold face for greatest) at large scale, per the mock's shared UCard
// anatomy — OVR+position top-left, rarity dot+label top-right, photo, name,
// rarity bar.

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { PackPull } from '@/lib/utcg/actions';
import { tierFromRank, getPullHeadshots } from '@/lib/utcg/actions';
import { quicksellValue, type PackKind, PACKS } from '@/lib/utcg/packs';
import type { CardTier } from '@/lib/utcg/packs';
import { RARITY, GOLD_FACE, GOLD_TEXT, tierLabel, tierDotStyle } from '@/components/utcg/card-tile';
import { TeamLogo } from '@/components/team-logo';
import { teamMeta } from '@/lib/ufa/teams';
import { CoinGlyph } from '@/components/utcg/coin-glyph';

type Stage = 'pack' | 'tear' | 'reveal' | 'summary';
type CardPhase = 'facedown' | 'flipping' | 'revealed';

// Dark reveal-stage backdrop (#0E1622, used throughout below) — matches the
// app's existing hero-slide dark base (see redesign-v2-style-guide.md's Hero
// Carousel section).

// Per-index reveal timing, from the mock (ANT = anticipation hold before the
// flip starts, FLIP = flip duration, DIM = background dim opacity once
// revealed) — escalates toward the 7th card so the pack builds tension into
// its best pull, independent of what tier that pull actually turned out to
// be (a mid pack still gets a satisfying ramp).
const ANT_MS = [350, 350, 420, 480, 750, 950, 1400];
const FLIP_MS = [340, 340, 380, 420, 540, 580, 680];
const DIM = [0, 0, 0, 0, 0.55, 0.7, 0.92];

function teamColorsFor(teamSlug: string): { primary: string; accent: string; logo: string | null } {
  const meta = teamMeta(teamSlug);
  return { primary: meta.primary, accent: meta.accent, logo: meta.logo ?? null };
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Closed pack (stage 1/2) — crimped foil wrapper, per-kind finish ───────

const CLOSED_PACK_BG: Record<PackKind, string> = {
  free: 'linear-gradient(165deg,#241f14 0%,#12110d 40%,#1c1a12 68%,#2a2416 100%)',
  bronze: 'linear-gradient(160deg,#4a3826 0%,#2b2015 38%,#3a2c1c 66%,#5a422a 100%)',
  silver: 'linear-gradient(160deg,#c3ccd4 0%,#7d848d 32%,#e4e9ee 56%,#8b929b 80%,#cfd6dd 100%)',
  gold: 'linear-gradient(160deg,#8a6a1c 0%,#3a2e10 30%,#C98F1F 55%,#7a5a14 78%,#F5C451 100%)',
  platinum: 'linear-gradient(160deg,#8fa2b8 0%,#4a5a70 30%,#b9c7d8 55%,#5c6f88 78%,#dfe8f2 100%)',
};

function Crimp({ position }: { position: 'top' | 'bottom' }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'absolute inset-x-0 h-4 z-20 pointer-events-none bg-white/10',
        '[mask-image:repeating-linear-gradient(90deg,#000_0_3px,transparent_3px_7px)]',
        '[-webkit-mask-image:repeating-linear-gradient(90deg,#000_0_3px,transparent_3px_7px)]',
        position === 'top' ? 'top-0' : 'bottom-0',
      ].join(' ')}
    />
  );
}

function ClosedPack({ packKind, reducedMotion, tearing }: { packKind: PackKind; reducedMotion: boolean; tearing: boolean }) {
  return (
    <div
      className={[
        'relative w-[250px] h-[356px] rounded-card-lg overflow-hidden shadow-hero',
        !tearing && !reducedMotion ? 'motion-safe:animate-pack-breathe' : '',
        tearing ? 'motion-safe:animate-pack-tear-scale' : '',
      ].join(' ')}
    >
      <Crimp position="top" />
      <div
        className="absolute inset-0 bg-[image:var(--foil)]"
        style={{ '--foil': CLOSED_PACK_BG[packKind] } as React.CSSProperties}
        aria-hidden="true"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 mix-blend-screen bg-[image:linear-gradient(115deg,rgba(42,167,155,0.10)_8%,transparent_32%,rgba(144,97,249,0.09)_58%,transparent_80%,rgba(255,61,0,0.08))]"
      />
      {!reducedMotion && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -translate-x-full motion-safe:animate-foil-sweep bg-[image:linear-gradient(115deg,transparent_40%,rgba(255,255,255,0.4)_50%,transparent_60%)]"
        />
      )}
      {tearing && <span aria-hidden="true" className="absolute inset-0 bg-white motion-safe:animate-flash-white" />}

      <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 h-full text-center">
        <span className="font-display italic text-6xl text-white leading-[0.9] drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">UTCG</span>
        <span className="h-[3px] w-[52px] bg-accent my-1" aria-hidden="true" />
        <span className="text-[10px] font-semibold tracking-[0.26em] uppercase text-white/60">{PACKS[packKind].name} · Series 01</span>
      </div>
      <Crimp position="bottom" />
    </div>
  );
}

function TearParticles() {
  const colors = ['#FF3D00', '#FFFFFF', '#F5C451'];
  const particles = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI * 2 + (i % 3) * 0.15;
    const dist = 90 + (i % 4) * 40;
    return {
      color: colors[i % colors.length],
      end: `translate(${(Math.cos(angle) * dist).toFixed(0)}px, ${(Math.sin(angle) * dist).toFixed(0)}px) scale(0)`,
      delay: `${(i % 5) * 20}ms`,
      size: 4 + (i % 3) * 2,
    };
  });
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full motion-safe:animate-particle-burst w-[var(--size)] h-[var(--size)] bg-[color:var(--c)] [box-shadow:0_0_8px_1px_var(--c)] [animation-delay:var(--delay)]"
          style={{ '--size': `${p.size}px`, '--c': p.color, '--delay': p.delay, '--particle-end': p.end } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ── Card back — team-agnostic repeating disc-motif + UTCG mark ───────────

function FacedownCard() {
  return (
    <div className="relative w-full h-full rounded-card-lg flex items-center justify-center overflow-hidden bg-[#141412]">
      <span
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.14] [background-image:radial-gradient(circle,transparent_0,transparent_5px,rgba(255,255,255,0.9)_5px,rgba(255,255,255,0.9)_6.5px,transparent_6.5px)] [background-size:34px_34px] [background-position:0_0,17px_17px]"
      />
      <span aria-hidden="true" className="absolute inset-3 rounded-card pointer-events-none shadow-[inset_0_0_0_1px_#2a2a26]" />
      <div className="relative z-10 flex flex-col items-center justify-center gap-2">
        <span className="font-display italic text-5xl text-white leading-none">UTCG</span>
        <span className="text-[8px] font-semibold tracking-[0.3em] uppercase text-white/45">The Layout · Trading Card Game</span>
      </div>
    </div>
  );
}

// ── Card front — CardTile's rarity-material language at large scale ──────

// Photo area for the reveal/summary cards — same fallback language as
// CardTile's CardPhoto (team-color wash + ghosted team-logo watermark +
// large monogram initials when there's no headshot, which is ~61% of pulls).
// The wash uses a soft diagonal blend (no hard percentage stop) to avoid a
// visible banding line where the gradient starts.
//
// `fill`: CardFront's photo sits in a height-bounded flex-column (the card
// has aspectRatio:3/4), so `flex-1` correctly grows to fill the remaining
// space there. SummaryCard wraps this in a plain flex-ROW div with no bounded
// height, where flex-1 has nothing to grow against and collapses to 0 (the
// exact bug CardTile's photo had) — so non-fill callers get a self-sizing
// aspectRatio box instead, which works in any context.
function RevealPhoto({ pull, headshotUrl, gold, fill = true }: { pull: PackPull; headshotUrl: string | null; gold: boolean; fill?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [headshotUrl]);
  const showPhoto = headshotUrl && !failed;
  const teamColors = teamColorsFor(pull.teamSlug);

  return (
    <div
      className={[
        'relative w-full my-3.5 rounded-card overflow-hidden bg-[color:var(--team-primary)]',
        fill ? 'flex-1 min-h-0' : 'flex-shrink-0 aspect-[4/3]',
      ].join(' ')}
      style={{ '--team-primary': teamColors.primary } as React.CSSProperties}
    >
      <span
        className="absolute inset-0 bg-[image:var(--team-wash)]"
        style={{ '--team-wash': `linear-gradient(155deg, ${teamColors.primary} 0%, ${teamColors.accent}40 100%)` } as React.CSSProperties}
        aria-hidden="true"
      />
      {teamColors.logo && (
        <span className="absolute -bottom-4 -right-4 pointer-events-none" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={teamColors.logo} alt="" className="w-28 h-28 object-contain opacity-[0.16] brightness-0 invert" />
        </span>
      )}
      {!showPhoto && !teamColors.logo && (
        <span className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <span className="font-display italic font-bold text-white opacity-[0.14] leading-none text-[90px]">
            {pull.teamAbbr}
          </span>
        </span>
      )}

      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={headshotUrl!} alt="" className="absolute inset-0 w-full h-full object-cover object-[center_22%]" onError={() => setFailed(true)} />
      ) : (
        <span
          className={`absolute inset-0 flex items-center justify-center font-display italic font-bold text-[48px] ${gold ? 'text-[#241A04]/[0.55]' : 'text-white/90'}`}
        >
          {initialsOf(pull.name)}
        </span>
      )}
    </div>
  );
}

function CardFront({ pull, headshotUrl }: { pull: PackPull; headshotUrl: string | null }) {
  const tier: CardTier = tierFromRank(pull.tierRank);
  const rarity = RARITY[tier];
  const gold = tier === 'greatest';
  const value = pull.isNew || pull.untradeable ? null : quicksellValue(pull.playerScore);

  return (
    <div
      className={[
        'relative w-full h-full flex flex-col p-5 overflow-hidden rounded-card-lg',
        gold ? 'bg-[image:var(--face)]' : 'bg-[#141412] [box-shadow:var(--ring)]',
      ].join(' ')}
      style={
        gold
          ? ({ '--face': GOLD_FACE } as React.CSSProperties)
          : ({ '--ring': `inset 0 0 0 1.5px ${rarity.c}, inset 0 60px 70px -55px ${rarity.c}66` } as React.CSSProperties)
      }
    >
      <div className="flex items-start justify-between">
        <div className="leading-none">
          <p className={`font-display italic font-bold text-6xl leading-[0.85] ${gold ? 'text-[#241A04]' : 'text-[#F4F2EC]'}`}>
            {pull.playerScore.toFixed(0)}
          </p>
          <p className={`text-[10px] font-bold tracking-[0.14em] uppercase mt-2 whitespace-nowrap ${gold ? 'text-[#6b5314]' : 'text-[#8a8a82]'}`}>
            {pull.teamAbbr} · {pull.year}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] mt-1.5 ${gold ? 'text-[#241A04]' : 'text-[color:var(--rarity)]'}`}
          style={!gold ? ({ '--rarity': rarity.c } as React.CSSProperties) : undefined}
        >
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[color:var(--dot)]" style={tierDotStyle(tier)} />
          {rarity.label}
        </span>
      </div>

      <RevealPhoto pull={pull} headshotUrl={headshotUrl} gold={gold} />

      <p className={`font-display italic font-bold text-4xl leading-[0.95] truncate pr-[0.14em] ${gold ? 'text-[#241A04]' : 'text-[#F4F2EC]'}`}>
        {pull.name}
      </p>
      <span
        className={`h-1 rounded-full mt-3 ${gold ? 'bg-[linear-gradient(90deg,#4A3606,#8a6a1c)]' : 'bg-[color:var(--rarity)]'}`}
        style={gold ? undefined : ({ '--rarity': rarity.c } as React.CSSProperties)}
        aria-hidden="true"
      />

      {/* Chip — New, Reward (untradeable), or dupe-value. Mock anchors this at
          bottom:78px (a ribbon above the name/bar block), NOT top-right —
          top-right collided with and truncated the rarity label there. */}
      <span
        className={[
          'absolute bottom-[74px] -right-1.5 text-[10px] font-extrabold tracking-[0.1em] px-3.5 py-1.5 rounded-l-md',
          pull.isNew || pull.untradeable
            ? gold ? 'bg-[#241A04] text-[#F5C451]' : 'bg-accent text-white'
            : gold ? 'bg-[#241A04]/20 text-[#241A04]' : 'bg-white/10 text-white/75',
        ].join(' ')}
      >
        {pull.isNew ? 'New' : pull.untradeable ? 'Reward' : (
          <span className="inline-flex items-center gap-1 tabular">
            <CoinGlyph size={11} />+{value}
          </span>
        )}
      </span>

      {gold && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -translate-x-full motion-safe:animate-foil-sweep mix-blend-overlay bg-[image:linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]"
        />
      )}
    </div>
  );
}

// ── Progress + jackpot label ─────────────────────────────────────────────

function RevealProgress({ total, index }: { total: number; index: number }) {
  return (
    <p className="text-[12px] font-bold tracking-[0.24em] uppercase font-tight text-white/55 tabular">
      Card {index + 1} / {total}
    </p>
  );
}

function RaySweep({ jackpot }: { jackpot: boolean }) {
  return (
    <div className="absolute -inset-[45%] pointer-events-none overflow-hidden motion-safe:animate-ray-spin" aria-hidden="true">
      <div
        className={[
          'w-full h-full [mask-image:radial-gradient(circle,#000_0%,transparent_68%)] [-webkit-mask-image:radial-gradient(circle,#000_0%,transparent_68%)]',
          jackpot
            ? 'bg-[image:repeating-conic-gradient(from_0deg_at_50%_50%,rgba(245,196,81,0.16)_0deg_7deg,transparent_7deg_26deg)]'
            : 'bg-[image:repeating-conic-gradient(from_0deg_at_50%_50%,rgba(245,196,81,0.1)_0deg_7deg,transparent_7deg_26deg)]',
        ].join(' ')}
      />
    </div>
  );
}

function PulledCard({
  pull,
  phase,
  reducedMotion,
  headshotUrl,
  flipMs,
}: {
  pull: PackPull;
  phase: CardPhase;
  reducedMotion: boolean;
  headshotUrl: string | null;
  flipMs: number;
}) {
  const tier: CardTier = tierFromRank(pull.tierRank);
  const revealed = phase === 'revealed' || reducedMotion;
  const isJackpot = tier === 'greatest';
  const isElite = tier === 'elite';
  const teamColors = teamColorsFor(pull.teamSlug);

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-[300px] mx-auto [perspective:1100px]">
      {revealed && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -m-12 rounded-full pointer-events-none motion-safe:animate-fade-in bg-[image:var(--glow)]"
          style={{ '--glow': `radial-gradient(circle, ${teamColors.primary}55, transparent 68%)` } as React.CSSProperties}
        />
      )}
      {revealed && isJackpot && !reducedMotion && <RaySweep jackpot />}
      {revealed && (isJackpot || isElite) && !reducedMotion && (
        <span
          aria-hidden="true"
          className={['absolute inset-0 -m-8 rounded-card-xl motion-safe:animate-pulse-burst', isJackpot ? 'bg-[#F5C451]/35' : 'bg-[#9061F9]/25'].join(' ')}
        />
      )}
      {revealed && isElite && !reducedMotion && <EliteDrift />}
      {revealed && isJackpot && !reducedMotion && <GoldDrift />}

      {/* The card does ONE thing: flip in on reveal. Fixes from the janky
          version: (1) dropped `transition-all`, which fought the flip keyframe
          and re-fired on every headshot/background swap; (2) removed the
          card-level `animate-card-shake` — the whole overlay already shakes on a
          jackpot (see the stage container), so shaking the card too was a
          double-shake. `will-change` + translateZ keep the flip on the GPU. */}
      <div
        className={[
          'relative w-full aspect-[3/4] rounded-card-lg overflow-hidden',
          revealed && !reducedMotion ? 'motion-safe:animate-card-flip-in [will-change:transform,opacity] [transform:translateZ(0)]' : '',
        ].join(' ')}
      >
        {!revealed ? <FacedownCard /> : <CardFront pull={pull} headshotUrl={headshotUrl} />}
      </div>

      {revealed && isJackpot && (
        <div className="text-center mt-6 motion-safe:animate-fade-in">
          <span className="block font-display italic text-4xl text-[#F5C451]">All-Time Greatest</span>
          <span className="block text-[10px] font-bold tracking-[0.3em] uppercase mt-1.5 text-[#8a7a4a]">
            The Jackpot · 1 in 400 packs
          </span>
        </div>
      )}
    </div>
  );
}

function EliteDrift() {
  const dots = [
    { top: '10%', left: '15%', delay: '0s' }, { top: '75%', left: '80%', delay: '0.5s' },
    { top: '50%', left: '85%', delay: '1s' }, { top: '85%', left: '20%', delay: '0.3s' },
    { top: '20%', left: '75%', delay: '0.8s' }, { top: '60%', left: '10%', delay: '1.3s' },
  ];
  return (
    <div className="absolute -inset-8 pointer-events-none" aria-hidden="true">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full motion-safe:animate-mote-drift w-[3px] h-[3px] bg-[#9061F9] shadow-[0_0_8px_2px_rgba(144,97,249,0.7)] top-[var(--top)] left-[var(--left)] [animation-delay:var(--delay)]"
          style={{ '--top': d.top, '--left': d.left, '--delay': d.delay } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function GoldDrift() {
  const dots = [
    { top: '18%', left: '10%', delay: '0s' }, { top: '70%', left: '85%', delay: '0.6s' },
    { top: '45%', left: '90%', delay: '1.1s' }, { top: '82%', left: '15%', delay: '1.6s' },
    { top: '25%', left: '78%', delay: '0.3s' }, { top: '58%', left: '6%', delay: '0.9s' },
  ];
  return (
    <div className="absolute -inset-10 pointer-events-none" aria-hidden="true">
      {dots.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full motion-safe:animate-mote-drift w-[3px] h-[3px] bg-[#F5C451] shadow-[0_0_8px_2px_rgba(245,196,81,0.7)] top-[var(--top)] left-[var(--left)] [animation-delay:var(--delay)]"
          style={{ '--top': d.top, '--left': d.left, '--delay': d.delay } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

interface PackOpenAnimationProps {
  pulls: PackPull[];
  packKind: PackKind;
  onSellDuplicates: (dupes: { playerId: string; teamSlug: string; year: number; qty: number }[]) => Promise<void>;
  selling: boolean;
  sellError: string | null;
  onDone: () => void;
}

export function PackOpenAnimation({ pulls, packKind, onSellDuplicates, selling, sellError, onDone }: PackOpenAnimationProps) {
  const reducedMotion = usePrefersReducedMotion();

  const [headshots, setHeadshots] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    getPullHeadshots(pulls.map((p) => p.playerId)).then((m) => {
      if (!alive) return;
      // Preload every headshot into the browser cache BEFORE any card flips, so
      // the <img> paints instantly on reveal instead of popping in mid-flip
      // (the async swap during the flip animation was a visible jank source).
      for (const url of m.values()) {
        const img = new Image();
        img.src = url;
      }
      setHeadshots(m);
    });
    return () => { alive = false; };
  }, [pulls]);
  const headshotFor = useCallback((playerId: string) => headshots.get(playerId) ?? null, [headshots]);

  const [stage, setStage] = useState<Stage>(reducedMotion ? 'reveal' : 'pack');
  const [tearing, setTearing] = useState(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<CardPhase>(reducedMotion ? 'revealed' : 'facedown');

  const [sold, setSold] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);

  // Auto-run the ANT (hold) -> FLIP (reveal) sequence for the current card,
  // per the mock's timing arrays. Skips straight to 'front'/'revealed' under
  // reduced motion.
  useEffect(() => {
    if (stage !== 'reveal') return;
    clearTimers();
    if (reducedMotion) {
      setPhase('revealed');
      return;
    }
    setPhase('facedown');
    const ant = ANT_MS[index] ?? 400;
    later(() => setPhase('revealed'), ant);
  }, [stage, index, reducedMotion, clearTimers, later]);

  // Brief lockout right when the jackpot card reveals, so it can't be
  // skipped past instantly.
  const jackpotTierRank = 7;
  const [jackpotLocked, setJackpotLocked] = useState(false);
  useEffect(() => {
    if (stage === 'reveal' && phase === 'revealed' && pulls[index]?.tierRank === jackpotTierRank) {
      setJackpotLocked(true);
      const t = setTimeout(() => setJackpotLocked(false), 1300);
      return () => clearTimeout(t);
    }
  }, [stage, phase, index, pulls]);

  const startTear = useCallback(() => {
    if (stage !== 'pack') return;
    if (reducedMotion) {
      setStage('reveal');
      return;
    }
    setTearing(true);
    setStage('tear');
    later(() => setStage('reveal'), 1000);
  }, [stage, reducedMotion, later]);

  const skipTear = useCallback(() => {
    if (stage === 'tear') {
      clearTimers();
      setStage('reveal');
    }
  }, [stage, clearTimers]);

  const advance = useCallback(() => {
    if (stage === 'pack') {
      startTear();
      return;
    }
    if (stage === 'tear') {
      skipTear();
      return;
    }
    if (stage !== 'reveal') return;
    if (jackpotLocked) return;

    if (!reducedMotion && phase !== 'revealed') {
      clearTimers();
      setPhase('revealed');
      return;
    }
    if (index + 1 < pulls.length) {
      setIndex((i) => i + 1);
    } else {
      setStage('summary');
    }
  }, [stage, phase, index, pulls.length, reducedMotion, jackpotLocked, startTear, skipTear, clearTimers]);

  const skipToSummary = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearTimers();
    setStage('summary');
  }, [clearTimers]);

  useEffect(() => {
    if (reducedMotion) {
      setStage('reveal');
      setPhase('revealed');
    }
  }, [reducedMotion]);

  const dupeGroups = useMemo(() => {
    const map = new Map<string, { playerId: string; teamSlug: string; year: number; qty: number; playerScore: number; name: string; teamAbbr: string }>();
    for (const p of pulls) {
      // Reward-pack pulls are untradeable — never offer them for quicksell,
      // even when they duplicate a card the user already owns.
      if (p.isNew || p.untradeable) continue;
      const key = `${p.playerId}|${p.teamSlug}|${p.year}`;
      const existing = map.get(key);
      if (existing) existing.qty += 1;
      else map.set(key, { playerId: p.playerId, teamSlug: p.teamSlug, year: p.year, qty: 1, playerScore: p.playerScore, name: p.name, teamAbbr: p.teamAbbr });
    }
    return Array.from(map.values());
  }, [pulls]);

  const totalDupeValue = dupeGroups.reduce((s, d) => s + quicksellValue(d.playerScore) * d.qty, 0);

  const handleSell = useCallback(async () => {
    await onSellDuplicates(dupeGroups.map(({ playerId, teamSlug, year, qty }) => ({ playerId, teamSlug, year, qty })));
    setSold(true);
  }, [dupeGroups, onSellDuplicates]);

  const bestPull = useMemo(() => {
    if (pulls.length === 0) return null;
    return pulls.reduce((best, p) => {
      if (p.tierRank > best.tierRank) return p;
      if (p.tierRank === best.tierRank && p.playerScore > best.playerScore) return p;
      return best;
    }, pulls[0]);
  }, [pulls]);
  const bestIsStarPlus = bestPull ? bestPull.tierRank >= 5 : false;

  if (stage === 'pack') {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 cursor-pointer bg-[#0E1622]"
        onClick={advance}
        role="button"
        tabIndex={0}
        aria-label="Tap to open pack"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') advance(); }}
      >
        <div className="text-center mb-10">
          <p className="font-display italic text-4xl text-white leading-none">Player Pack</p>
          <p className="text-[11px] font-semibold tracking-[0.28em] uppercase text-white/45 mt-2.5">UTCG · Series 01 · 7 Cards</p>
        </div>
        <ClosedPack packKind={packKind} reducedMotion={reducedMotion} tearing={false} />
        <p className="text-[13px] font-bold tracking-[0.32em] uppercase text-white mt-12 motion-safe:animate-cue-pulse">
          Tap to open
        </p>
      </div>
    );
  }

  if (stage === 'tear') {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4 cursor-pointer overflow-hidden bg-[#0E1622]"
        onClick={advance}
        role="button"
        tabIndex={0}
        aria-label="Opening pack"
      >
        <ClosedPack packKind={packKind} reducedMotion={reducedMotion} tearing={tearing} />
        <TearParticles />
      </div>
    );
  }

  if (stage === 'reveal') {
    const current = pulls[index];
    const tier: CardTier | null = current ? tierFromRank(current.tierRank) : null;
    const jackpot = tier === 'greatest';
    const revealed = phase === 'revealed' || reducedMotion;
    const dim = revealed ? DIM[Math.min(index, DIM.length - 1)] : 0;

    return (
      <div
        className={[
          'fixed inset-0 z-50 flex flex-col cursor-pointer motion-safe:transition-colors motion-safe:duration-300',
          jackpot && revealed ? 'bg-black motion-safe:animate-card-shake' : 'bg-[#0E1622]',
        ].join(' ')}
        onClick={advance}
        role="button"
        tabIndex={0}
        aria-label="Tap to reveal next card"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') advance(); }}
      >
        {/* Rarity-tinted radial tint + progressive dim, per mock rv-tint/rv-dim */}
        {tier && (
          <span
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none motion-safe:transition-[background] motion-safe:duration-400 bg-[image:var(--tint)]"
            style={{ '--tint': `radial-gradient(circle at 50% 40%, ${RARITY[tier].c}26, transparent 62%)` } as React.CSSProperties}
          />
        )}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-black pointer-events-none motion-safe:transition-opacity motion-safe:duration-500 [opacity:var(--dim)]"
          style={{ '--dim': dim } as React.CSSProperties}
        />
        {jackpot && revealed && !reducedMotion && <RaySweep jackpot />}

        <div className="relative z-10 flex items-center justify-between px-6 pt-7">
          <RevealProgress total={pulls.length} index={index} />
          {index < pulls.length - 1 && (
            <button
              type="button"
              onClick={skipToSummary}
              className="text-[10px] font-bold tracking-[0.2em] uppercase font-tight px-3 py-2 rounded-full min-h-[36px] border border-white/25 text-white/65 hover:text-white hover:border-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Skip
            </button>
          )}
        </div>

        <div className="relative z-10 flex-1 flex items-center justify-center mb-16">
          {current && (
            <PulledCard
              pull={current}
              phase={phase}
              reducedMotion={reducedMotion}
              headshotUrl={headshotFor(current.playerId)}
              flipMs={FLIP_MS[index] ?? 500}
            />
          )}
        </div>

        {!jackpotLocked && (
          <p className="relative z-10 text-[13px] font-bold tracking-[0.32em] uppercase text-white text-center mb-16 motion-safe:animate-cue-pulse">
            {index < pulls.length - 1 ? 'Tap for next card' : 'Tap to continue'}
          </p>
        )}
      </div>
    );
  }

  // ── Stage: summary — stays on the same dark stage as the reveal (mock:
  // .summary { background: radial-gradient(gold glow top-center), ink }) so
  // the flow never jarringly cuts from dark to cream. ──
  const bestRarity = bestPull ? RARITY[tierFromRank(bestPull.tierRank)] : null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto motion-safe:animate-fade-in bg-[#0E1622] bg-[image:radial-gradient(circle_at_50%_18%,rgba(245,196,81,0.14),transparent_55%)]">
      <div className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-10 flex flex-col items-center gap-6">
        <div className="text-center motion-safe:animate-fade-up">
          {bestIsStarPlus && bestPull && bestRarity ? (
            <>
              <p
                className="text-[11px] font-extrabold tracking-[0.3em] uppercase mb-1.5 text-[color:var(--rarity)]"
                style={{ '--rarity': bestRarity.c } as React.CSSProperties}
              >
                {tierLabel(tierFromRank(bestPull.tierRank))} Pulled
              </p>
              <h2 className="font-display italic text-3xl sm:text-4xl font-bold text-white leading-[0.95] tracking-[-0.02em]">
                {bestPull.name} · {bestPull.playerScore.toFixed(0)}
              </h2>
            </>
          ) : (
            <>
              <h2 className="font-display italic text-3xl sm:text-4xl font-bold text-white leading-[0.95] tracking-[-0.02em]">
                Pack opened!
              </h2>
              <p className="text-sm text-white/55 font-tight mt-2">{PACKS[packKind].name} · {pulls.length} cards</p>
            </>
          )}
        </div>

        {bestPull && bestRarity && (
          <div className="relative flex flex-col items-center motion-safe:animate-fade-up [animation-delay:90ms]">
            <span
              aria-hidden="true"
              className="absolute inset-0 -m-16 rounded-full pointer-events-none bg-[image:var(--glow)]"
              style={{ '--glow': `radial-gradient(circle, ${bestRarity.c}55 0%, transparent 70%)` } as React.CSSProperties}
            />
            <div className="relative w-[156px]">
              <SummaryCard pull={bestPull} large headshotUrl={headshotFor(bestPull.playerId)} />
            </div>
          </div>
        )}

        <div className="w-full grid grid-cols-3 gap-2.5">
          {pulls
            .filter((p) => p !== bestPull)
            .map((p, i) => (
              <div
                key={i}
                className="motion-safe:animate-fade-up [animation-delay:var(--delay)]"
                style={{ '--delay': `${180 + i * 70}ms` } as React.CSSProperties}
              >
                <SummaryCard pull={p} headshotUrl={headshotFor(p.playerId)} />
              </div>
            ))}
        </div>

        {dupeGroups.length > 0 && (
          <div className="w-full rounded-card p-4 flex items-center justify-between gap-3 flex-wrap bg-[rgba(255,255,255,0.06)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
            <div>
              <p className="text-[12.5px] font-bold text-white font-tight">
                {dupeGroups.reduce((s, d) => s + d.qty, 0)} duplicate{dupeGroups.reduce((s, d) => s + d.qty, 0) === 1 ? '' : 's'}
              </p>
              <p className="text-[11px] text-white/55 font-tight">Sell for {totalDupeValue.toLocaleString()} coins</p>
            </div>
            <button
              type="button"
              onClick={handleSell}
              disabled={selling || sold}
              className={[
                'inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full flex-shrink-0',
                'text-[11px] font-bold tracking-[0.1em] uppercase font-tight',
                'min-h-[44px]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'motion-safe:transition-opacity motion-safe:duration-150',
                sold ? 'bg-white/10 text-white/40 cursor-default' : 'bg-accent text-white hover:opacity-90 cursor-pointer',
              ].join(' ')}
            >
              {sold ? 'Sold' : selling ? 'Selling…' : (
                <>
                  Sell duplicates <CoinGlyph size={12} />
                </>
              )}
            </button>
          </div>
        )}

        {sellError && (
          <p
            className="w-full text-[12px] text-center text-white/70 font-tight rounded-card px-4 py-3 bg-[rgba(255,255,255,0.06)]"
            role="alert"
          >
            {sellError}
          </p>
        )}

        <button
          type="button"
          onClick={onDone}
          className={[
            'inline-flex items-center justify-center px-8 py-3.5 rounded-full',
            'text-[12px] font-bold tracking-[0.16em] uppercase font-tight',
            'bg-accent text-white hover:opacity-90 transition-opacity duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1622]',
            'min-h-[52px] min-w-[220px] cursor-pointer shadow-[0_12px_30px_rgba(255,61,0,0.35)]',
          ].join(' ')}
        >
          Add to Collection
        </button>
      </div>
    </div>
  );
}

// Both SummaryCard variants render exclusively on the dark summary stage
// (never a theme-flippable surface), so — unlike CardTile — they always use
// literal light text/dark chip colors rather than text-ink/bg-surface tokens.
function SummaryCard({ pull, large = false, headshotUrl = null }: { pull: PackPull; large?: boolean; headshotUrl?: string | null }) {
  const tier: CardTier = tierFromRank(pull.tierRank);
  const rarity = RARITY[tier];
  const gold = tier === 'greatest';
  const teamColors = teamColorsFor(pull.teamSlug);

  if (large) {
    return (
      <div
        className={[
          'flex flex-col gap-2.5 p-4 rounded-card-lg w-full shadow-hero',
          gold ? 'bg-[image:var(--face)]' : 'bg-[#161B22] [box-shadow:var(--ring)]',
        ].join(' ')}
        style={
          gold
            ? ({ '--face': GOLD_FACE } as React.CSSProperties)
            : ({ '--ring': `inset 0 0 0 1.5px ${rarity.c}` } as React.CSSProperties)
        }
      >
        <div className="flex items-start justify-between gap-1.5">
          <TeamLogo team={{ abbr: pull.teamAbbr, ...teamColors }} size={22} />
          {pull.isNew ? (
            <span
              className={`text-[9px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full leading-none ${gold ? 'bg-[#241A04] text-[#F5C451]' : 'bg-[#FF3D00] text-white'}`}
            >
              New
            </span>
          ) : pull.untradeable ? (
            <span
              className={`text-[9px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full leading-none ${gold ? 'bg-[#241A04] text-[#F5C451]' : 'bg-[rgba(255,255,255,0.14)] text-white'}`}
            >
              Reward
            </span>
          ) : (
            <span className={`text-[9px] font-bold tabular ${gold ? 'text-[#6b5314]' : 'text-[rgba(255,255,255,0.55)]'}`}>
              Dupe
            </span>
          )}
        </div>
        <div className="flex justify-center py-1">
          <RevealPhoto pull={pull} headshotUrl={headshotUrl} gold={gold} fill={false} />
        </div>
        <p className={`text-[14px] font-tight font-bold leading-tight truncate ${gold ? 'text-[#241A04]' : 'text-[#F4F2EC]'}`}>
          {pull.name}
        </p>
        <div className="flex items-center justify-between">
          <span className={`font-display italic font-bold text-3xl tabular leading-none ${gold ? 'text-[#241A04]' : 'text-[#F4F2EC]'}`}>
            {pull.playerScore.toFixed(0)}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.06em] ${gold ? 'text-[#241A04]' : 'text-[color:var(--rarity)]'}`}
            style={!gold ? ({ '--rarity': rarity.c } as React.CSSProperties) : undefined}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--dot)]" style={tierDotStyle(tier)} />
            {rarity.label}
          </span>
        </div>
        {!pull.isNew && !pull.untradeable && (
          <span className={`text-[11px] font-tight ${gold ? 'text-[#6b5314]' : 'text-[rgba(255,255,255,0.5)]'}`}>
            Worth {quicksellValue(pull.playerScore)} coins
          </span>
        )}
        {pull.untradeable && (
          <span className={`text-[11px] font-tight ${gold ? 'text-[#6b5314]' : 'text-[rgba(255,255,255,0.5)]'}`}>
            Untradeable
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={[
        'flex flex-col gap-2 p-3 rounded-card',
        gold ? 'bg-[image:var(--face)]' : 'bg-[#161B22] [box-shadow:var(--ring)]',
      ].join(' ')}
      style={
        gold
          ? ({ '--face': GOLD_FACE } as React.CSSProperties)
          : ({ '--ring': `inset 0 0 0 1.5px ${rarity.c}66` } as React.CSSProperties)
      }
    >
      <div className="flex items-start justify-between gap-1.5">
        <TeamLogo team={{ abbr: pull.teamAbbr, ...teamColors }} size={18} />
        {pull.isNew ? (
          <span
            className={`text-[8px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full leading-none ${gold ? 'bg-[#241A04] text-[#F5C451]' : 'bg-[#FF3D00] text-white'}`}
          >
            New
          </span>
        ) : pull.untradeable ? (
          <span
            className={`text-[8px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-full leading-none ${gold ? 'bg-[#241A04] text-[#F5C451]' : 'bg-[rgba(255,255,255,0.14)] text-white'}`}
          >
            Reward
          </span>
        ) : (
          <span className={`text-[8px] font-bold tabular ${gold ? 'text-[#6b5314]' : 'text-[rgba(255,255,255,0.5)]'}`}>Dupe</span>
        )}
      </div>
      <p className={`text-[11.5px] font-tight font-bold leading-tight truncate ${gold ? 'text-[#241A04]' : 'text-[#F4F2EC]'}`}>{pull.name}</p>
      <div className="flex items-center justify-between">
        <span className={`font-display font-bold text-base tabular leading-none ${gold ? 'text-[#241A04]' : 'text-[#F4F2EC]'}`}>{pull.playerScore.toFixed(0)}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--dot)]" style={tierDotStyle(tier)} aria-hidden="true" />
      </div>
      {!pull.isNew && !pull.untradeable && (
        <span className={`text-[9.5px] font-tight ${gold ? 'text-[#6b5314]' : 'text-[rgba(255,255,255,0.5)]'}`}>
          Worth {quicksellValue(pull.playerScore)} coins
        </span>
      )}
      {pull.untradeable && (
        <span className={`text-[9.5px] font-tight ${gold ? 'text-[#6b5314]' : 'text-[rgba(255,255,255,0.5)]'}`}>
          Untradeable
        </span>
      )}
    </div>
  );
}
