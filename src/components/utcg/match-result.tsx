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
import { matchPayMultiplier } from '@/lib/utcg/progression';

interface MatchResultProps {
  result: SquadScoreResult;
  /** null while recordMatch() is still in flight; number once resolved. */
  coinsAwarded: number | null;
  /** Server hit the daily match-reward cap — reward was 0 by design. */
  rewardCapped?: boolean;
  /** Squad Battles played today (UTC) including this one, from the server's
   *  recordMatch() response — drives the pay-decay context line below the
   *  coin award (matchPayMultiplier decays by match-of-day). null while the
   *  request is still in flight. */
  matchesToday?: number | null;
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
            className="w-11 h-11 rounded-full -translate-y-9 border-[4px] border-[#FF3D00] border-t-transparent shadow-[0_0_20px_rgba(255,61,0,0.45),inset_0_0_10px_rgba(255,61,0,0.3)]"
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
          className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out w-[var(--pct)] ${accent ? 'bg-[#FF3D00]' : 'bg-[linear-gradient(90deg,#7d7a70,#cfcfc6)]'}`}
          style={{ '--pct': `${pct}%` } as React.CSSProperties}
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
          className="absolute rounded-[1px] motion-safe:animate-conf-fly w-[var(--size)] h-[var(--h)] bg-[color:var(--bg)] [transform:rotate(var(--rot))] [animation-delay:var(--delay)]"
          style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--size': `${p.s}px`, '--h': `${p.s * 1.7}px`, '--bg': p.c, '--rot': `${p.rot}deg`, '--delay': `${p.d}s` } as React.CSSProperties}
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
          className="absolute rounded-full bg-[#F5C451] motion-safe:animate-gold-drift shadow-[0_0_8px_rgba(245,196,81,0.8)] [left:var(--x)] [top:var(--y)] w-[var(--size)] h-[var(--size)] [animation-delay:var(--delay)] [animation-duration:var(--dur)]"
          style={{ '--x': `${p.x}%`, '--y': `${p.y}%`, '--size': `${p.s}px`, '--delay': `${p.d}s`, '--dur': `${p.t}s` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function MatchResult({ result, coinsAwarded, rewardCapped = false, matchesToday = null, matchError, onBuildAgain, onBackToPlay }: MatchResultProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { wins, losses, rationale } = result.record;
  const isPerfect = wins === 12;
  const isWin = wins > losses;
  const simulating = coinsAwarded === null && !matchError && !reducedMotion;
  const full = !simulating;

  return (
    <div
      className={`relative flex flex-col min-h-[70vh] rounded-card-xl overflow-hidden ${isPerfect && full ? 'bg-[#050504]' : ''}`}
    >
      {isPerfect && full && !reducedMotion && (
        <div
          className="absolute -inset-[45%] pointer-events-none motion-safe:animate-ray-spin bg-[repeating-conic-gradient(from_0deg_at_50%_50%,rgba(245,196,81,0.16)_0deg_7deg,transparent_7deg_26deg)] [mask-image:radial-gradient(circle,#000_0%,transparent_66%)] [-webkit-mask-image:radial-gradient(circle,#000_0%,transparent_66%)]"
          aria-hidden="true"
        />
      )}
      {!isPerfect && (
        <span
          aria-hidden="true"
          className={`absolute inset-0 pointer-events-none motion-safe:transition-opacity motion-safe:duration-600 ${full ? 'opacity-100' : 'opacity-0'} ${isWin ? 'bg-[radial-gradient(circle_at_50%_34%,rgba(255,61,0,0.16),transparent_60%)]' : 'bg-[radial-gradient(circle_at_50%_34%,rgba(255,61,0,0.07),transparent_60%)]'}`}
        />
      )}

      {simulating ? (
        <SimBeat reducedMotion={reducedMotion} />
      ) : (
        <div className="relative z-[4] flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-0">
          <p
            className={`text-[11px] font-extrabold tracking-[0.32em] uppercase ${isPerfect ? 'text-[#F5C451]' : isWin ? 'text-[#FF3D00]' : ''}`}
          >
            <span className={isPerfect || isWin ? '' : 'text-faint'}>Season Complete</span>
          </p>

          {isPerfect && (
            <p
              className="font-display italic text-5xl sm:text-6xl leading-[0.86] mt-2.5 motion-safe:animate-slam bg-[linear-gradient(160deg,#FBE9AE,#F5C451_44%,#E4A32C_70%,#F8DA80)] bg-clip-text text-transparent [filter:drop-shadow(0_4px_24px_rgba(245,196,81,0.4))]"
            >
              Undefeated
            </p>
          )}

          <p
            aria-live="assertive"
            aria-label={`Final record: ${wins} wins, ${losses} losses`}
            className={`font-display italic font-bold tabular leading-[0.8] text-[100px] sm:text-[132px] mt-1.5 mb-0.5 motion-safe:animate-slam ${isPerfect ? 'text-[#F5C451] [text-shadow:0_0_50px_rgba(245,196,81,0.6)]' : isWin ? 'text-[#FF3D00] [text-shadow:0_0_44px_rgba(255,61,0,0.55)]' : ''}`}
          >
            <span className={isPerfect || isWin ? '' : 'text-ink'}>{wins}</span>
            <span className={isPerfect ? 'mx-1 opacity-60' : 'mx-1 text-faint'}>–</span>
            <span className={`${isPerfect || isWin ? '' : 'text-faint'} ${isPerfect ? 'text-[#F5C451]/70' : ''}`}>{losses}</span>
          </p>

          {!isPerfect && (
            <p className="font-display italic text-3xl text-ink mt-1">
              {isWin ? 'Strong Season' : 'Rebuild Season'}
            </p>
          )}

          <p className={`text-[13px] leading-relaxed max-w-[300px] mt-2.5 ${isPerfect ? 'text-[#b39a5c]' : 'text-muted'}`}>
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
                  <span className={`font-display italic font-bold text-4xl tabular ${isPerfect ? 'text-[#F5C451]' : 'text-[#FF3D00]'}`}>
                    +{(coinsAwarded ?? 0).toLocaleString()}
                  </span>
                  <span className={`text-[10px] font-bold tracking-[0.24em] uppercase ${isPerfect ? 'text-[#b39a5c]' : ''}`}>
                    <span className={isPerfect ? '' : 'text-faint'}>Coins</span>
                  </span>
                </div>
                {rewardCapped && (
                  <span className="text-[11px] text-faint font-tight">
                    Daily match rewards used up — coins return tomorrow.
                  </span>
                )}
                {!rewardCapped && matchesToday !== null && (
                  <span className="text-[11px] text-faint font-tight">
                    Match {matchesToday} today · {Math.round(matchPayMultiplier(matchesToday) * 100)}% pay
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
