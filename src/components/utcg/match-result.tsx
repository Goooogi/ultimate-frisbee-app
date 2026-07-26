'use client';

// MatchResult — reveal screen after "Play Match". Matches the authoritative
// mock (utcg-result-app.jsx / match-result.css): a "Simulating Season" beat
// (spinning disc + scrambling score) while the request is in flight, then a
// slammed-in italic W–L record, strength/chemistry bars, a coin-award line,
// and celebratory confetti on a win / a full gold takeover on a perfect 12-0.
//
// Unlike the mock (which fakes a fixed 1050ms sim delay), the sim beat here
// tracks REAL async state: `scoreSquad()` already ran synchronously before
// this component mounts (see utcg-game.tsx), so the record is known
// immediately — but recordMatch() (the server-authoritative coin award) is
// still in flight. We show the sim beat for exactly as long as that takes
// (coinsAwarded === null && !matchError), then slam in the full result. This
// means the W-L reveal is never faked — it's always tied to real network state.

import { useEffect, useMemo, useState } from 'react';
import type { SquadScoreResult } from '@/lib/utcg/formations';
import { MAX_TEAM_CHEM } from '@/lib/utcg/chemistry';

interface MatchResultProps {
  result: SquadScoreResult;
  /** null while recordMatch() is still in flight; number once resolved. */
  coinsAwarded: number | null;
  /** Server hit the daily match-reward cap — reward was 0 by design. */
  rewardCapped?: boolean;
  matchError: string | null;
  onBuildAgain: () => void;
  onBackToPlay: () => void;
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

// Scrambling placeholder score during the sim beat — cosmetic only, replaced
// the instant the real record is available (which is already known before
// this component mounts; this is purely a "simulating…" flourish).
function useScrambleScore(active: boolean): [number, number] {
  const [sc, setSc] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => setSc([Math.floor(Math.random() * 13), Math.floor(Math.random() * 13)]), 90);
    return () => clearInterval(iv);
  }, [active]);
  return sc;
}

function SimBeat({ reducedMotion }: { reducedMotion: boolean }) {
  const [a, b] = useScrambleScore(!reducedMotion);
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
      <p className="font-display italic text-xl text-ink/90">Simulating Season</p>
      {!reducedMotion && (
        <p className="font-display italic font-bold text-6xl tabular text-accent leading-none">
          {a}<span className="opacity-40 mx-1">–</span>{b}
        </p>
      )}
      <p className="text-[10px] font-bold tracking-[0.28em] uppercase text-faint">Rating · Chemistry · Schedule</p>
    </div>
  );
}

function Bar({ label, value, max, accent }: { label: string; value: number; max: number; accent?: boolean }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="text-left">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint">{label}</span>
        <span className="font-display italic font-bold text-lg text-ink tabular leading-none">
          {Math.round(value)}
          {max === MAX_TEAM_CHEM && <span className="text-[11px] text-faint ml-0.5">/{max}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
        <div
          className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
          style={{ width: `${pct}%`, background: accent ? '#FF3D00' : 'linear-gradient(90deg,#7d7a70,#cfcfc6)' }}
        />
      </div>
    </div>
  );
}

function Confetti({ gold }: { gold: boolean }) {
  const parts = useMemo(
    () =>
      Array.from({ length: gold ? 46 : 34 }, (_, i) => ({
        dx: (Math.random() * 2 - 1) * 300,
        dy: -(Math.random() * 260 + 80),
        s: 4 + Math.random() * 7,
        d: Math.random() * 0.35,
        rot: Math.random() * 360,
        c: gold ? (i % 3 === 0 ? '#FFF0C0' : i % 4 === 0 ? '#fff' : '#F5C451') : i % 4 === 0 ? '#fff' : i % 5 === 0 ? '#F5C451' : '#FF3D00',
      })),
    [gold],
  );
  return (
    <div className="absolute left-1/2 top-[40%] z-[6] pointer-events-none" aria-hidden="true">
      {parts.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-[1px] motion-safe:animate-conf-fly"
          style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, width: p.s, height: p.s * 1.7, background: p.c, transform: `rotate(${p.rot}deg)`, animationDelay: `${p.d}s` } as React.CSSProperties}
        />
      ))}
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

export function MatchResult({ result, coinsAwarded, rewardCapped = false, matchError, onBuildAgain, onBackToPlay }: MatchResultProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { wins, losses, rationale } = result.record;
  const isPerfect = wins === 12;
  const isWin = wins > losses;
  const simulating = coinsAwarded === null && !matchError && !reducedMotion;
  const full = !simulating;

  return (
    <div
      className="relative flex flex-col min-h-[70vh] rounded-card-xl overflow-hidden"
      style={isPerfect && full ? { background: '#050504' } : undefined}
    >
      {isPerfect && full && !reducedMotion && (
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
      {!isPerfect && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none motion-safe:transition-opacity motion-safe:duration-600"
          style={{
            opacity: full ? 1 : 0,
            background: isWin
              ? 'radial-gradient(circle at 50% 34%, rgba(255,61,0,0.16), transparent 60%)'
              : 'radial-gradient(circle at 50% 34%, rgba(255,61,0,0.07), transparent 60%)',
          }}
        />
      )}

      {simulating ? (
        <SimBeat reducedMotion={reducedMotion} />
      ) : (
        <div className="relative z-[4] flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-0">
          <p
            className="text-[11px] font-extrabold tracking-[0.32em] uppercase"
            style={{ color: isPerfect ? '#F5C451' : isWin ? '#FF3D00' : undefined }}
          >
            <span className={isPerfect || isWin ? '' : 'text-faint'}>Season Complete</span>
          </p>

          {isPerfect && (
            <p
              className="font-display italic text-5xl sm:text-6xl leading-[0.86] mt-2.5 motion-safe:animate-slam"
              style={{
                background: 'linear-gradient(160deg,#FBE9AE,#F5C451 44%,#E4A32C 70%,#F8DA80)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                filter: 'drop-shadow(0 4px 24px rgba(245,196,81,0.4))',
              }}
            >
              Undefeated
            </p>
          )}

          <p
            aria-live="assertive"
            aria-label={`Final record: ${wins} wins, ${losses} losses`}
            className="font-display italic font-bold tabular leading-[0.8] text-[100px] sm:text-[132px] mt-1.5 mb-0.5 motion-safe:animate-slam"
            style={isPerfect ? { color: '#F5C451', textShadow: '0 0 50px rgba(245,196,81,0.6)' } : isWin ? { color: '#FF3D00', textShadow: '0 0 44px rgba(255,61,0,0.55)' } : undefined}
          >
            <span className={isPerfect || isWin ? '' : 'text-ink'}>{wins}</span>
            <span className={isPerfect ? 'mx-1 opacity-60' : 'mx-1 text-faint'}>–</span>
            <span className={isPerfect || isWin ? '' : 'text-faint'} style={isPerfect ? { color: 'rgba(245,196,81,0.7)' } : undefined}>{losses}</span>
          </p>

          {!isPerfect && (
            <p className="font-display italic text-3xl text-ink mt-1">
              {isWin ? 'Strong Season' : 'Rebuild Season'}
            </p>
          )}

          <p className={['text-[13px] leading-relaxed max-w-[300px] mt-2.5', isPerfect ? '' : 'text-muted'].join(' ')} style={isPerfect ? { color: '#b39a5c' } : undefined}>
            {rationale}
          </p>

          <div className="w-full max-w-[300px] mt-7 flex flex-col gap-4">
            <Bar label="Chemistry" value={result.chem} max={MAX_TEAM_CHEM} accent />
            <Bar label="Team Strength" value={result.effectiveStrength} max={99} />
          </div>

          <div className="mt-6 flex flex-col items-center gap-1">
            {matchError ? (
              <span className="text-[12px] text-muted font-tight" role="alert">{matchError}</span>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-display italic font-bold text-4xl tabular" style={{ color: isPerfect ? '#F5C451' : '#FF3D00' }}>
                    +{(coinsAwarded ?? 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] font-bold tracking-[0.24em] uppercase" style={{ color: isPerfect ? '#b39a5c' : undefined }}>
                    <span className={isPerfect ? '' : 'text-faint'}>Coins</span>
                  </span>
                </div>
                {rewardCapped && (
                  <span className="text-[11px] text-faint font-tight">
                    Daily match rewards used up — coins return tomorrow.
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {full && !reducedMotion && isWin && <Confetti gold={isPerfect} />}
      {full && !reducedMotion && isPerfect && <GoldDrift />}

      <div className="relative z-[7] flex gap-3 px-6 pb-8 pt-2">
        <button
          type="button"
          onClick={onBackToPlay}
          className={[
            'flex-1 inline-flex items-center justify-center h-14 rounded-card',
            'text-[15px] font-extrabold tracking-[0.02em]',
            'border-[1.5px] motion-safe:transition-colors motion-safe:duration-150 active:translate-y-px cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
            isPerfect ? 'border-[rgba(245,196,81,0.3)] text-[#e8d8a8]' : 'border-ink/20 text-ink',
          ].join(' ')}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onBuildAgain}
          className={[
            'flex-[1.7] inline-flex items-center justify-center h-14 rounded-card',
            'text-[15px] font-extrabold tracking-[0.02em]',
            'bg-accent text-white shadow-[0_12px_30px_rgba(255,61,0,0.35)]',
            'motion-safe:transition-transform motion-safe:duration-100 active:translate-y-px cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          ].join(' ')}
        >
          Build Again
        </button>
      </div>
    </div>
  );
}
