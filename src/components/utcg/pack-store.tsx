'use client';

// PackStore — PACKS tab. Matches the authoritative mock (utcg-store-app.jsx /
// pack-store.css): a vertical shelf of tall, crimped foil-wrapper product
// cards — the free weekly pack (glowing/ready vs. dimmed/cooldown-ring) then
// the STORE_ORDER buy packs, escalating in foil richness bronze (matte) →
// silver (brushed) → gold (metallic) → platinum (prismatic). A floating coin pill sits over the
// shelf. Clicking an affordable pack fires a brief "charge" flourish, then
// calls onOpenPack() — the parent (utcg-game.tsx) owns the actual reveal
// transition (PackOpenAnimation), so this file's own takeover stays a short
// hand-off beat, not a duplicate of the full reveal.

import { useEffect, useMemo, useState } from 'react';
import { PACKS, STORE_ORDER, TIERS, type PackKind, type CardTier } from '@/lib/utcg/packs';
import { RARITY, tierDotStyle } from '@/components/utcg/card-tile';
import { CoinGlyph } from '@/components/utcg/coin-glyph';

// ── helpers ──────────────────────────────────────────────────────────────

function guaranteeLabel(kind: PackKind): string | null {
  const def = PACKS[kind];
  if (!def.guarantee) return null;
  return TIERS.find((t) => t.key === def.guarantee)?.label ?? null;
}

function guaranteeTier(kind: PackKind): CardTier | null {
  return PACKS[kind].guarantee ?? null;
}

function splitCountdown(ms: number): { primary: string; secondary: string } {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return { primary: `${d}d ${h}h`, secondary: `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` };
  if (h > 0) return { primary: `${h}h ${m}m`, secondary: `${s}s` };
  return { primary: `${m}m`, secondary: `${s}s` };
}

function formatCountdownCoarse(ms: number): string {
  const totalMin = Math.ceil(ms / 60000);
  const d = Math.floor(totalMin / (60 * 24));
  const h = Math.floor((totalMin % (60 * 24)) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

// ── foil finish specs (literal, intentional — like a real foil pack; from
// pack-store.css .free/.fin-bronze/.fin-silver/.fin-gold/.fin-platinum) ────

const FOIL_BG: Record<PackKind, string> = {
  free: 'linear-gradient(165deg,#241f14 0%,#12110d 40%,#1c1a12 68%,#2a2416 100%)',
  bronze: 'linear-gradient(160deg,#4a3826 0%,#2b2015 38%,#3a2c1c 66%,#5a422a 100%)',
  silver: 'linear-gradient(160deg,#c3ccd4 0%,#7d848d 32%,#e4e9ee 56%,#8b929b 80%,#cfd6dd 100%)',
  gold: 'linear-gradient(160deg,#8a6a1c 0%,#3a2e10 30%,#C98F1F 55%,#7a5a14 78%,#F5C451 100%)',
  platinum: 'linear-gradient(160deg,#8fa2b8 0%,#4a5a70 30%,#b9c7d8 55%,#5c6f88 78%,#dfe8f2 100%)',
};

// ── crimped foil-wrapper edge ───────────────────────────────────────────

const CRIMP_MASK = 'repeating-linear-gradient(90deg, #000 0 3px, transparent 3px 7px)';

function Crimp({ position }: { position: 'top' | 'bottom' }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'absolute inset-x-0 h-4 z-[6] pointer-events-none bg-white/10',
        position === 'top' ? 'top-0' : 'bottom-0',
      ].join(' ')}
      style={{ WebkitMaskImage: CRIMP_MASK, maskImage: CRIMP_MASK }}
    />
  );
}

interface PackStoreProps {
  coins: number;
  freePackReadyInMs: number;
  onOpenPack: (kind: PackKind) => void;
  opening: PackKind | null;
  actionError: string | null;
}

export function PackStore({ coins, freePackReadyInMs, onOpenPack, opening, actionError }: PackStoreProps) {
  const reducedMotion = usePrefersReducedMotion();

  const [remainingMs, setRemainingMs] = useState(freePackReadyInMs);
  const capturedAt = useMemo(() => Date.now(), [freePackReadyInMs]);

  useEffect(() => {
    setRemainingMs(freePackReadyInMs);
    if (freePackReadyInMs <= 0) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - capturedAt;
      setRemainingMs(Math.max(0, freePackReadyInMs - elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [freePackReadyInMs, capturedAt]);

  const freeReady = remainingMs <= 0;
  const { primary: cdPrimary, secondary: cdSecondary } = splitCountdown(remainingMs);
  const cooldownFrac = freePackReadyInMs > 0 ? Math.min(1, Math.max(0, remainingMs / freePackReadyInMs)) : 0;

  return (
    <div className="relative flex flex-col gap-5 pb-6">
      {/* No coin pill here — the app-level header (utcg-game.tsx) already
          shows one; a second visible pill on this tab was the exact bug the
          original restyle brief called out. */}
      <div>
        <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight mb-1.5">The Layout · UTCG</p>
        <h1 className="font-display italic text-3xl sm:text-4xl font-bold text-ink leading-[0.95] tracking-[-0.02em]">Pack Store</h1>
        <p className="text-[12px] text-muted font-tight mt-1.5">Series 01</p>
      </div>

      {actionError && (
        <p className="text-[12px] text-center text-muted font-tight rounded-card bg-surface shadow-card px-4 py-3" role="alert">
          {actionError}
        </p>
      )}

      {/* 5 tiles (Free + Bronze/Silver/Gold/Platinum). Grid so they share width:
          2-up on mobile, 3-up on sm, all 5 on ONE row from lg up (tiles shrink
          to fit the cell instead of a fixed 240px). */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 justify-items-center items-start">
        <FreePackTile
          ready={freeReady}
          countdownPrimary={cdPrimary}
          countdownSecondary={cdSecondary}
          countdownCoarse={formatCountdownCoarse(remainingMs)}
          cooldownFrac={cooldownFrac}
          disabled={opening !== null}
          reducedMotion={reducedMotion}
          onOpen={() => onOpenPack('free')}
        />
        {STORE_ORDER.map((kind) => (
          <BuyPackTile
            key={kind}
            kind={kind}
            coins={coins}
            disabled={opening !== null}
            reducedMotion={reducedMotion}
            onOpen={() => onOpenPack(kind)}
          />
        ))}
      </div>

      <p className="text-center text-[11px] font-medium text-faint font-tight pt-2">
        More packs unlock as the season progresses.
      </p>
    </div>
  );
}

// ── shared product-card shell (mock: .prod, height 748 desktop → fluid here) ─

// Fill the grid cell (up to a sane cap) so 5 tiles share one row on desktop.
const PROD_W = 'w-full max-w-[300px]';

function ProdShell({
  children,
  dim,
  reducedMotion,
  bob,
}: {
  children: React.ReactNode;
  dim?: boolean;
  reducedMotion: boolean;
  bob?: boolean;
}) {
  return (
    <div className={`${PROD_W} flex-shrink-0`}>
      <div
        className={[
          'relative w-full rounded-card-lg overflow-hidden shadow-hero',
          dim ? 'saturate-[0.4] brightness-[0.6]' : '',
          bob && !reducedMotion ? 'motion-safe:animate-pack-bob' : '',
        ].join(' ')}
        style={{ aspectRatio: '9 / 16' }}
      >
        <Crimp position="top" />
        {children}
        <Crimp position="bottom" />
      </div>
    </div>
  );
}

function Guarantee({ floorLabel, tier }: { floorLabel: string; tier: CardTier }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[9px] font-bold tracking-[0.04em] uppercase text-white/90 bg-black/30 px-3 py-1.5 rounded-full max-w-full">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ ...tierDotStyle(tier), boxShadow: `0 0 8px ${RARITY[tier].c}` }} />
      <span className="truncate">Guaranteed {floorLabel} or better</span>
    </span>
  );
}

// ── Free pack tile ───────────────────────────────────────────────────────

function FreePackTile({
  ready,
  countdownPrimary,
  countdownSecondary,
  countdownCoarse,
  cooldownFrac,
  disabled,
  reducedMotion,
  onOpen,
}: {
  ready: boolean;
  countdownPrimary: string;
  countdownSecondary: string;
  countdownCoarse: string;
  cooldownFrac: number;
  disabled: boolean;
  reducedMotion: boolean;
  onOpen: () => void;
}) {
  const canOpen = ready && !disabled;
  const guarantee = guaranteeLabel('free');
  const guaranteeKey = guaranteeTier('free');
  const R = 44;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = CIRC * cooldownFrac;

  return (
    <ProdShell dim={!ready} reducedMotion={reducedMotion} bob={ready}>
      <div className="absolute inset-0" style={{ background: FOIL_BG.free }} aria-hidden="true" />
      {ready && (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 60% at 50% 42%, rgba(255,61,0,0.22), transparent 62%), radial-gradient(90% 50% at 50% 84%, rgba(245,196,81,0.16), transparent 70%)',
            boxShadow: 'inset 0 0 60px rgba(255,61,0,0.14), inset 0 0 0 1.5px rgba(255,61,0,0.32)',
          }}
        />
      )}
      {ready && !reducedMotion && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -translate-x-full motion-safe:animate-foil-sweep mix-blend-overlay"
          style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)' }}
        />
      )}

      <div className="relative z-[5] flex flex-col items-center justify-between h-full px-5 py-7 text-center">
        <div className="flex items-center gap-2 text-[9.5px] font-bold tracking-[0.22em] text-white/70">
          <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-[9px] font-display italic">L</span>
          UTCG · SERIES 01
        </div>
        <span
          className={[
            'text-[10px] font-extrabold tracking-[0.16em] uppercase px-3 py-1.5 rounded-full leading-none',
            ready ? 'bg-accent text-white shadow-[0_4px_12px_rgba(255,61,0,0.4)]' : 'bg-white/[0.14] text-white/70',
          ].join(' ')}
        >
          {ready ? 'Free' : 'Claimed'}
        </span>

        {ready ? (
          <div className="flex flex-col items-center gap-2.5">
            <span className="font-display italic text-5xl text-white leading-[0.82] drop-shadow-[0_4px_24px_rgba(0,0,0,0.4)]">Weekly</span>
            <span className="font-display italic text-5xl text-white/40 leading-[0.82]">Pack</span>
            <Guarantee floorLabel={guarantee ?? 'Contributor'} tier={guaranteeKey ?? 'contributor'} />
          </div>
        ) : (
          <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
            <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90" aria-hidden="true">
              <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
              <circle
                cx="64"
                cy="64"
                r={R}
                fill="none"
                stroke="#FF3D00"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
                className={reducedMotion ? '' : 'motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear'}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
              <span className="text-[8px] font-bold tracking-[0.2em] uppercase text-white/50">Next pack in</span>
              <span className="font-display italic text-2xl text-white tabular leading-none">{countdownPrimary}</span>
              <span className="text-[10px] font-semibold text-white/55 tabular">{countdownSecondary}</span>
            </div>
          </div>
        )}

        <div className="w-full flex flex-col gap-3.5">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-white/70">
            <span className="font-display italic text-[14px] text-white mr-0.5">7</span> Cards · 1 Guaranteed Pull
          </p>
          {ready ? (
            <button
              type="button"
              onClick={onOpen}
              disabled={!canOpen}
              aria-label="Open free pack"
              className="w-full h-14 rounded-card bg-accent text-white text-[15px] font-extrabold tracking-[0.04em] shadow-[0_12px_30px_rgba(255,61,0,0.4)] motion-safe:transition-transform motion-safe:duration-100 active:translate-y-px cursor-pointer disabled:opacity-60"
            >
              Open Free Pack
            </button>
          ) : (
            <button
              type="button"
              disabled
              aria-label={`On cooldown, come back in ${countdownCoarse}`}
              className="w-full h-14 rounded-card bg-white/[0.08] flex flex-col items-center justify-center gap-0.5 cursor-default"
              style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }}
            >
              <span className="text-[13px] font-extrabold tracking-[0.12em] text-white/60">On Cooldown</span>
              <span className="text-[10px] font-medium text-white/40">come back {countdownCoarse}</span>
            </button>
          )}
        </div>
      </div>
    </ProdShell>
  );
}

// ── Buy pack tile (bronze / gold / elite) ───────────────────────────────

function BuyPackTile({
  kind,
  coins,
  disabled,
  reducedMotion,
  onOpen,
}: {
  kind: PackKind;
  coins: number;
  disabled: boolean;
  reducedMotion: boolean;
  onOpen: () => void;
}) {
  const def = PACKS[kind];
  const affordable = coins >= def.price;
  const canOpen = affordable && !disabled;
  const guarantee = guaranteeLabel(kind);
  const guaranteeKey = guaranteeTier(kind);
  const shortfall = def.price - coins;

  const [charging, setCharging] = useState(false);
  const handleClick = () => {
    if (!canOpen) return;
    if (reducedMotion) {
      onOpen();
      return;
    }
    setCharging(true);
    setTimeout(() => {
      setCharging(false);
      onOpen();
    }, 260);
  };

  // Silver & Platinum are LIGHT metallic foils → dark ink for the wordmark;
  // Bronze/Gold are dark/warm → light ink.
  const wordColor =
    kind === 'bronze' ? '#f0dcc2'
    : kind === 'silver' ? '#2a3038'
    : kind === 'gold' ? '#fff4d6'
    : kind === 'platinum' ? '#232d3a'
    : '#fff';
  const wordColor2 =
    kind === 'bronze' ? 'rgba(240,220,194,0.34)'
    : kind === 'silver' ? 'rgba(42,48,56,0.42)'
    : kind === 'gold' ? 'rgba(255,244,214,0.38)'
    : kind === 'platinum' ? 'rgba(35,45,58,0.42)'
    : 'rgba(245,196,81,0.5)';

  return (
    <ProdShell dim={!affordable} reducedMotion={reducedMotion} bob={affordable}>
      <div className="absolute inset-0" style={{ background: FOIL_BG[kind] }} aria-hidden="true" />

      {kind === 'platinum' && (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-0 mix-blend-screen"
            style={{
              background:
                'linear-gradient(118deg, rgba(42,167,155,.16) 6%, transparent 26%, rgba(144,97,249,.2) 46%, transparent 64%, rgba(255,61,0,.14) 78%, rgba(245,196,81,.18))',
              boxShadow: 'inset 0 0 0 2px rgba(245,196,81,0.55), inset 0 0 80px rgba(144,97,249,0.18)',
            }}
          />
          {!reducedMotion && affordable && (
            <span
              aria-hidden="true"
              className="absolute -inset-8 opacity-40 motion-safe:animate-spin-slow"
              style={{
                background:
                  'repeating-conic-gradient(from 0deg, rgba(245,196,81,0.08) 0 6deg, transparent 6deg 22deg)',
              }}
            />
          )}
          {!reducedMotion && affordable && <Motes />}
        </>
      )}

      {kind !== 'bronze' && !reducedMotion && affordable && (
        <span
          aria-hidden="true"
          className="absolute inset-0 -translate-x-full motion-safe:animate-foil-sweep mix-blend-overlay"
          style={{ background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.5) 50%, transparent 60%)' }}
        />
      )}

      {/* Light foils (silver/platinum) get a soft dark scrim at the top & bottom
          bands (where the small WHITE text lives — eyebrow, odds, buttons) so it
          stays legible on the bright metal. The middle stays clear for the metal
          to show through behind the DARK wordmark. Bronze/gold are dark enough
          already and skip this. */}
      {(kind === 'silver' || kind === 'platinum') && (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(12,16,22,0.5) 0%, rgba(12,16,22,0.12) 22%, transparent 42%, transparent 60%, rgba(12,16,22,0.18) 78%, rgba(12,16,22,0.55) 100%)' }}
        />
      )}

      {charging && <span aria-hidden="true" className="absolute inset-0 bg-white motion-safe:animate-charge-flash" />}

      <div className="relative z-[5] flex flex-col items-center justify-between h-full px-5 py-7 text-center">
        <div className="flex items-center gap-2 text-[9.5px] font-bold tracking-[0.22em] text-white/70">
          <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center text-[9px] font-display italic">L</span>
          UTCG · SERIES 01
        </div>

        <div className="flex flex-col items-center gap-2.5">
          <span className="font-display italic text-5xl leading-[0.82] drop-shadow-[0_4px_24px_rgba(0,0,0,0.4)]" style={{ color: wordColor }}>
            {def.name.replace(' Pack', '')}
          </span>
          <span className="font-display italic text-5xl leading-[0.82]" style={{ color: wordColor2 }}>Pack</span>
          {guarantee && guaranteeKey && <Guarantee floorLabel={guarantee} tier={guaranteeKey} />}
        </div>

        <div className="w-full flex flex-col gap-3.5">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-white/70">
            <span className="font-display italic text-[14px] text-white mr-0.5">7</span> Cards · Premium Odds
          </p>
          {affordable ? (
            <button
              type="button"
              onClick={handleClick}
              disabled={!canOpen}
              aria-label={`Open ${def.name} for ${def.price} coins`}
              className="w-full h-14 rounded-card flex items-center justify-between pl-5 pr-1.5 cursor-pointer motion-safe:transition-transform motion-safe:duration-100 active:translate-y-px disabled:opacity-60"
              style={{ background: '#ffffff', color: '#0A0A09' }}
            >
              <span className="text-[15px] font-extrabold tracking-[0.06em]">Open</span>
              <span className="flex items-center gap-1.5 text-[15px] font-extrabold tabular h-11 px-4 rounded-card-sm" style={{ color: '#F4F2EC', background: '#0A0A09' }}>
                <CoinGlyph size={15} />
                {def.price.toLocaleString()}
              </span>
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold" style={{ color: RARITY.greatest.c }}>
                <CoinGlyph size={13} /> {shortfall.toLocaleString()} more to unlock
              </p>
              <button
                type="button"
                disabled
                aria-label={`Not enough coins for ${def.name}`}
                className="w-full h-14 rounded-card flex items-center justify-between pl-5 pr-1.5 opacity-60 cursor-default"
                style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)' }}
              >
                <span className="text-[15px] font-extrabold tracking-[0.06em] text-white/70">Open</span>
                <span className="flex items-center gap-1.5 text-[15px] font-extrabold tabular text-white/70">
                  <CoinGlyph size={15} />
                  {def.price.toLocaleString()}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </ProdShell>
  );
}

// Small drifting motes for the elite pack — purely decorative, honors
// reduced-motion by not being rendered at all when it's on.
function Motes() {
  const dots = [
    { top: '18%', left: '22%', delay: '0s', size: 3 },
    { top: '65%', left: '70%', delay: '0.6s', size: 2 },
    { top: '40%', left: '80%', delay: '1.1s', size: 2.5 },
    { top: '78%', left: '30%', delay: '1.6s', size: 2 },
    { top: '30%', left: '55%', delay: '0.3s', size: 2 },
    { top: '52%', left: '15%', delay: '0.9s', size: 2 },
  ];
  return (
    <>
      {dots.map((d, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute rounded-full bg-[#F5C451] motion-safe:animate-mote-drift"
          style={{ top: d.top, left: d.left, width: d.size, height: d.size, animationDelay: d.delay, boxShadow: '0 0 6px 1px rgba(245,196,81,0.7)' }}
        />
      ))}
    </>
  );
}
