'use client';

// DraftGauntlet — after all 7 slots are drafted, the run enters status
// 'playing'. This screen shows the drafted squad + the next opponent + bank
// + reward ladder + a big PLAY button; on play, reuses match-result.tsx's
// SimBeat → slam-in W/L language. A win advances the ladder and deals the
// next (harder) opponent; a loss — or a 4-0 clear — ends the run and hands
// off to the run-complete screen (payout count-up, gold takeover on 4-0).
//
// Numbers before the FIRST round (chem/strength) aren't known yet — the
// server only returns them from playDraftRound's result, so the pre-round
// squad view shows '—' rather than inventing a client-side estimate (unlike
// SquadBuilder, which has real chemistry.ts to compute a live preview from —
// draft picks are ephemeral and never touch that engine).

import { useEffect, useMemo, useState } from 'react';
import type { DraftRun, DraftRoundResult } from '@/lib/utcg/draft';
import { DRAFT_TARGETS, DRAFT_REWARDS, DRAFT_JACKPOT } from '@/lib/utcg/draft';
import { FORMATIONS } from '@/lib/utcg/formations';
import { CardTile } from '@/components/utcg/card-tile';
import { draftCardToUtcgCard } from '@/components/utcg/draft-card';
import { CoinGlyph } from '@/components/utcg/coin-glyph';
import { CashOutConfirm } from '@/components/utcg/draft-pick';

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

interface DraftGauntletProps {
  run: DraftRun;
  /** playerId → headshot URL, resolved client-side by UtcgGame (the run
   *  payload carries no photos). Missing ids fall back to a monogram. */
  headshots: Map<string, string>;
  lastResult: DraftRoundResult | null;
  onPlayRound: () => Promise<void>;
  onCashOut: () => void;
  /** Called when the user leaves the run-complete screen. `again=true` means
   *  "Draft Again" (start a fresh formation pick immediately); `false` means
   *  "Back to Play" (return to the mode-select screen). */
  onDone: (again: boolean) => void;
  playing: boolean;
  error: string | null;
}

export function DraftGauntlet({ run, headshots, lastResult, onPlayRound, onCashOut, onDone, playing, error }: DraftGauntletProps) {
  const [showCashOutConfirm, setShowCashOutConfirm] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'sim' | 'reveal'>('idle');
  const reducedMotion = usePrefersReducedMotion();

  // Drive the sim → reveal beat off the `playing` prop (server round-trip),
  // same pattern as match-result.tsx: the sim beat shows for exactly as long
  // as the request takes, never a faked timer. If the round-trip FAILS
  // (network error, server rejection), `playing` still flips back to false
  // but `lastResult` is never set — fall back to 'idle' (not 'reveal') so the
  // error message underneath is actually visible instead of leaving the user
  // stuck on the sim beat forever with no way to see what went wrong or retry.
  useEffect(() => {
    if (playing) {
      setPhase('sim');
      return;
    }
    if (phase !== 'sim') return;
    setPhase(lastResult ? 'reveal' : 'idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, lastResult, error]);

  const handlePlay = () => {
    setPhase('sim');
    onPlayRound();
  };

  const isComplete = run.status === 'complete';

  if (isComplete) {
    return <DraftRunComplete run={run} lastResult={lastResult} onDone={onDone} reducedMotion={reducedMotion} />;
  }

  if (phase === 'reveal' && lastResult) {
    return (
      <DraftRoundReveal
        result={lastResult}
        reducedMotion={reducedMotion}
        onContinue={() => setPhase('idle')}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: '#0E1622' }}>
      <div className="flex-1 flex flex-col px-4 sm:px-6 pt-6 pb-8 max-w-2xl lg:max-w-4xl mx-auto w-full">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.24em] uppercase text-white/45">
              Draft Gauntlet · {FORMATIONS[run.formation].name}
            </p>
            <h1 className="font-display italic text-2xl sm:text-3xl font-bold text-white leading-[0.95] tracking-[-0.02em] mt-1">
              {phase === 'sim' ? 'Simulating…' : `Round ${run.round + 1} of ${DRAFT_TARGETS.length}`}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowCashOutConfirm(true)}
            disabled={phase === 'sim'}
            className="flex-shrink-0 text-[9px] font-bold tracking-[0.16em] uppercase text-white/35 hover:text-white/60 motion-safe:transition-colors motion-safe:duration-150 px-3 min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Cash Out
          </button>
        </div>

        {phase === 'sim' ? (
          <SimBeat reducedMotion={reducedMotion} />
        ) : (
          <>
            {/* Bank */}
            <div className="rounded-card-lg bg-white/[0.05] p-4 flex items-center justify-between mb-4">
              <div>
                <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/40">Bank</p>
                <p className="font-display italic font-bold text-3xl text-white tabular leading-none mt-1">
                  {run.bank.toLocaleString()}
                </p>
              </div>
              <CoinGlyph size={28} className="text-accent" />
            </div>

            {/* Reward ladder */}
            <RewardLadder round={run.round} />

            {/* Opponent */}
            <div className="rounded-card-lg bg-white/[0.05] p-4 flex items-center justify-between my-4">
              <div>
                <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/40">Round {run.round + 1} Opponent</p>
                <p className="font-display italic font-bold text-2xl text-white leading-none mt-1.5">
                  Strength {DRAFT_TARGETS[run.round]}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/40">Win Pays</p>
                <p className="font-display italic font-bold text-2xl tabular leading-none mt-1.5" style={{ color: '#F5C451' }}>
                  +{DRAFT_REWARDS[run.round].toLocaleString()}
                </p>
              </div>
            </div>

            {/* Drafted squad — all 7 on one row at lg so the whole gauntlet
                screen fits without scrolling; wraps to 4/3-wide below. */}
            <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/35 mb-3">Your Drafted Squad</p>
            <div className="grid grid-cols-4 lg:grid-cols-7 gap-2.5 mb-5">
              {run.picks.map((p, i) => (
                <div key={`${p.playerId}|${p.teamSlug}|${p.year}|${i}`}>
                  <CardTile card={draftCardToUtcgCard(p, headshots.get(p.playerId) ?? null)} compact />
                </div>
              ))}
            </div>

            {error && (
              <p className="text-[12px] text-center text-white/80 font-tight rounded-card bg-white/[0.06] px-4 py-3 mb-4" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handlePlay}
              className={[
                'w-full h-16 rounded-card bg-accent text-white text-[15px] font-extrabold tracking-[0.08em] uppercase',
                'shadow-[0_16px_36px_rgba(255,61,0,0.42)] motion-safe:animate-play-glow',
                'motion-safe:transition-transform motion-safe:duration-100 active:translate-y-px cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              ].join(' ')}
            >
              Play Round {run.round + 1}
            </button>
          </>
        )}
      </div>

      {showCashOutConfirm && (
        <CashOutConfirm
          bank={run.bank}
          onConfirm={() => {
            setShowCashOutConfirm(false);
            onCashOut();
          }}
          onCancel={() => setShowCashOutConfirm(false)}
        />
      )}
    </div>
  );
}

// ── Reward ladder — 4 steps, current one highlighted ────────────────────

function RewardLadder({ round }: { round: number }) {
  return (
    <div className="flex gap-2">
      {DRAFT_REWARDS.map((reward, i) => {
        const done = i < round;
        const current = i === round;
        return (
          <div
            key={i}
            className={[
              'flex-1 rounded-card-sm p-2.5 flex flex-col items-center gap-1 motion-safe:transition-all motion-safe:duration-200',
              current ? 'bg-accent/20' : done ? 'bg-white/[0.06]' : 'bg-white/[0.03]',
            ].join(' ')}
            style={current ? { boxShadow: 'inset 0 0 0 1.5px #FF3D00' } : undefined}
          >
            <span className={`text-[8px] font-bold tracking-[0.1em] uppercase ${current ? 'text-accent' : 'text-white/35'}`}>
              R{i + 1}
            </span>
            <span className={`font-display italic font-bold text-sm tabular leading-none ${done ? 'text-white/50' : current ? 'text-white' : 'text-white/60'}`}>
              {reward}
            </span>
            {done && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="text-accent">
                <path d="M2 5.2l2.2 2.2L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Simulating beat — reused language from match-result.tsx's SimBeat ────

function SimBeat({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 py-16">
      {!reducedMotion && (
        <div className="relative w-[120px] h-[120px] flex items-center justify-center motion-safe:animate-orb-spin">
          <span
            className="w-11 h-11 rounded-full -translate-y-9"
            style={{ border: '4px solid #FF3D00', borderTopColor: 'transparent', boxShadow: '0 0 20px rgba(255,61,0,0.45), inset 0 0 10px rgba(255,61,0,0.3)' }}
          />
        </div>
      )}
      <p className="font-display italic text-xl text-white/90">Playing Round…</p>
      <p className="text-[10px] font-bold tracking-[0.28em] uppercase text-white/40">Rating · Chemistry · Opponent</p>
    </div>
  );
}

// ── Round reveal — W or L, slam-in, matching match-result.tsx's language ─

function DraftRoundReveal({ result, reducedMotion, onContinue }: { result: DraftRoundResult; reducedMotion: boolean; onContinue: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center cursor-pointer"
      style={{ background: '#0E1622' }}
      onClick={onContinue}
      role="button"
      tabIndex={0}
      aria-label="Tap to continue"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onContinue(); }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: result.won
            ? 'radial-gradient(circle at 50% 34%, rgba(255,61,0,0.18), transparent 60%)'
            : 'radial-gradient(circle at 50% 34%, rgba(255,255,255,0.06), transparent 60%)',
        }}
      />
      <p
        className="relative z-10 text-[11px] font-extrabold tracking-[0.32em] uppercase"
        style={{ color: result.won ? '#FF3D00' : 'rgba(255,255,255,0.5)' }}
      >
        {result.won ? 'Round Won' : 'Round Lost'}
      </p>
      <p
        className={`relative z-10 font-display italic font-bold leading-[0.85] text-[88px] sm:text-[110px] mt-2 ${reducedMotion ? '' : 'motion-safe:animate-slam'}`}
        style={{ color: result.won ? '#FF3D00' : '#F4F2EC', textShadow: result.won ? '0 0 44px rgba(255,61,0,0.55)' : undefined }}
      >
        {result.won ? 'W' : 'L'}
      </p>
      <p className="relative z-10 text-[13px] text-white/55 mt-3 max-w-[280px]">
        Your squad ({Math.round(result.strength)} strength, {result.chem} chem) vs {result.opponentStrength} opponent.
      </p>
      {result.won && (
        <p className="relative z-10 font-display italic font-bold text-3xl tabular mt-5" style={{ color: '#F5C451' }}>
          Bank: {result.bank.toLocaleString()}
        </p>
      )}
      <p className="relative z-10 text-[11px] font-bold tracking-[0.2em] uppercase text-white/35 mt-8 motion-safe:animate-cue-pulse">
        Tap to continue
      </p>
    </div>
  );
}

// ── Run complete — payout count-up, jackpot celebration on 4-0 ──────────

function useCountUp(target: number, dur: number, run: boolean): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf: number;
    let start: number | null = null;
    const ease = (p: number) => 1 - Math.pow(1 - p, 3);
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / dur);
      setV(Math.round(target * ease(p)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur, run]);
  return v;
}

function DraftRunComplete({
  run,
  lastResult,
  onDone,
  reducedMotion,
}: {
  run: DraftRun;
  lastResult: DraftRoundResult | null;
  onDone: (again: boolean) => void;
  reducedMotion: boolean;
}) {
  const perfect = run.round === DRAFT_TARGETS.length && (lastResult?.won ?? false);
  const payout = run.payout ?? run.bank;
  const coinsUp = useCountUp(payout, perfect ? 1500 : 900, true);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center overflow-hidden"
      style={{ background: perfect ? '#050504' : '#0E1622' }}
    >
      {perfect && !reducedMotion && (
        <div
          className="absolute -inset-[45%] pointer-events-none motion-safe:animate-ray-spin"
          style={{
            background: 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(245,196,81,0.16) 0deg 7deg, transparent 7deg 26deg)',
            maskImage: 'radial-gradient(circle, #000 0%, transparent 66%)',
            WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 66%)',
          }}
          aria-hidden="true"
        />
      )}
      {perfect && !reducedMotion && <GoldDrift />}

      <p
        className="relative z-10 text-[11px] font-extrabold tracking-[0.32em] uppercase"
        style={{ color: perfect ? '#F5C451' : run.round > 0 ? '#FF3D00' : 'rgba(255,255,255,0.5)' }}
      >
        {perfect ? 'Perfect Gauntlet' : run.round > 0 ? 'Run Complete' : 'Run Ended'}
      </p>

      {perfect && (
        <p
          className="relative z-10 font-display italic text-4xl sm:text-5xl leading-[0.9] mt-3 motion-safe:animate-slam"
          style={{
            background: 'linear-gradient(160deg,#FBE9AE,#F5C451 44%,#E4A32C 70%,#F8DA80)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 4px 24px rgba(245,196,81,0.4))',
          }}
        >
          4-0 Cleared
        </p>
      )}

      <p className="relative z-10 font-display italic text-2xl text-white mt-4">
        {run.round} of {DRAFT_TARGETS.length} rounds won
      </p>

      <div className="relative z-10 mt-6 flex items-baseline gap-2">
        <span className="font-display italic font-bold text-6xl tabular" style={{ color: perfect ? '#F5C451' : '#FF3D00' }}>
          +{coinsUp.toLocaleString()}
        </span>
        <span className="text-[11px] font-bold tracking-[0.24em] uppercase text-white/50">Coins</span>
      </div>

      {perfect && (
        <p className="relative z-10 text-[11px] font-bold tracking-[0.16em] uppercase mt-2" style={{ color: '#b39a5c' }}>
          Includes a {DRAFT_JACKPOT.toLocaleString()}-coin jackpot
        </p>
      )}

      <div className="relative z-10 flex gap-3 mt-10 w-full max-w-[360px]">
        <button
          type="button"
          onClick={() => onDone(false)}
          className={[
            'flex-1 h-14 rounded-card text-[14px] font-extrabold tracking-[0.02em] cursor-pointer',
            'border-[1.5px] motion-safe:transition-colors motion-safe:duration-150 active:translate-y-px',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            perfect ? 'border-[rgba(245,196,81,0.3)] text-[#e8d8a8]' : 'border-white/20 text-white',
          ].join(' ')}
        >
          Back to Play
        </button>
        <button
          type="button"
          onClick={() => onDone(true)}
          className="flex-[1.4] h-14 rounded-card bg-accent text-white text-[14px] font-extrabold tracking-[0.02em] shadow-[0_12px_30px_rgba(255,61,0,0.35)] motion-safe:transition-transform motion-safe:duration-100 active:translate-y-px cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Draft Again
        </button>
      </div>
    </div>
  );
}

function GoldDrift() {
  const parts = useMemo(
    () => Array.from({ length: 20 }, () => ({ x: 6 + Math.random() * 88, y: 22 + Math.random() * 60, s: 2 + Math.random() * 5, d: Math.random() * 2.6, t: 2.8 + Math.random() * 2.4 })),
    [],
  );
  return (
    <div className="absolute inset-0 z-[5] pointer-events-none" aria-hidden="true">
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[#F5C451] motion-safe:animate-gold-drift"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, boxShadow: '0 0 8px rgba(245,196,81,0.8)', animationDelay: `${p.d}s`, animationDuration: `${p.t}s` }}
        />
      ))}
    </div>
  );
}
