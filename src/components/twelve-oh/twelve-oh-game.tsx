'use client';

// 12-0 game — the whole client-side game loop.
// State machine: 'spin' → 'loading' → 'pick' → ('spin' again) → 'result'
// All state is ephemeral (session-only, no DB writes).

import { useState, useEffect, useRef, useCallback } from 'react';
import type { TwelveOhTeamYear, TwelveOhPlayer } from '@/lib/twelve-oh/data';
import { getRoster } from '@/lib/twelve-oh/data';
import { scoreLabel, teamRecord } from '@/lib/twelve-oh/rating';
import { teamMeta } from '@/lib/ufa/teams';
import { TeamLogo } from '@/components/team-logo';

// ─── Types ─────────────────────────────────────────────────────────────────

interface DraftedPlayer extends TwelveOhPlayer {
  _key: string; // playerId + '|' + teamSlug + '|' + year — dedupe key
}

type GamePhase = 'mode-select' | 'spin' | 'loading' | 'pick' | 'result';
type GameMode = 'classic' | 'ultiq';

// ─── Constants ─────────────────────────────────────────────────────────────

const ROSTER_SIZE = 7;
const MAX_SKIPS = 1;            // a player may skip (re-spin without picking) only once per game
const SPIN_DURATION_MS = 1300;  // slot-machine cycle time
const SPIN_CYCLES = 18;         // how many random items to flash through

// Badge color by tier (mapped to Tailwind token classes)
// Thresholds mirror scoreLabel() tiers in rating.ts (recalibrated to the
// full-history distribution): ≥96 All-Time Greatest, ≥87 All-Time Elite,
// ≥77 Star, ≥68 Solid Pro, ≥55 Contributor, ≥38 League Average, ≥20 Fringe.
function badgeClasses(score: number): string {
  if (score >= 87) return 'bg-accent text-accent-ink';                    // Elite / Greatest
  if (score >= 77) return 'bg-accent/20 text-accent';                     // Star
  if (score >= 68) return 'bg-surface text-ink border border-border';     // Solid Pro
  if (score >= 55) return 'bg-surface text-muted border border-hairline'; // Contributor
  if (score >= 38) return 'bg-surface text-faint border border-hairline'; // League Average
  return 'bg-surface text-faint border border-hairline opacity-75';       // Fringe / Deep Bench
}

// ─── Helper: format percentage ────────────────────────────────────────────

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return `${v.toFixed(1)}%`;
}

// ─── Spin animation hook ─────────────────────────────────────────────────

function useSpinAnimation(
  teamYears: TwelveOhTeamYear[],
  active: boolean,
  onLand: (ty: TwelveOhTeamYear) => void,
): TwelveOhTeamYear | null {
  const [displayed, setDisplayed] = useState<TwelveOhTeamYear | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const targetRef = useRef<TwelveOhTeamYear | null>(null);

  useEffect(() => {
    if (!active || teamYears.length === 0) return;

    // Pick the final result immediately so we can pass it to onLand later.
    const target = teamYears[Math.floor(Math.random() * teamYears.length)];
    targetRef.current = target;

    let count = 0;
    intervalRef.current = setInterval(() => {
      count++;
      if (count >= SPIN_CYCLES) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setDisplayed(target);
        onLand(target);
      } else {
        const rand = teamYears[Math.floor(Math.random() * teamYears.length)];
        setDisplayed(rand);
      }
    }, SPIN_DURATION_MS / SPIN_CYCLES);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, teamYears, onLand]);

  return displayed;
}

// ─── Sub-components ────────────────────────────────────────────────────────

// Roster tray — shows 7 slots, filled or empty.
function RosterTray({ roster }: { roster: DraftedPlayer[] }) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${ROSTER_SIZE}, minmax(0, 1fr))` }}
      aria-label="Drafted roster"
    >
      {Array.from({ length: ROSTER_SIZE }).map((_, i) => {
        const p = roster[i];
        if (p) {
          const meta = teamMeta(p.teamSlug);
          return (
            <div
              key={p._key}
              className="flex flex-col items-center gap-1 p-1.5 rounded-md bg-surface border border-border min-w-0"
            >
              {meta && (
                <span className="flex-shrink-0">
                  <TeamLogo team={meta} size={18} />
                </span>
              )}
              <span className="text-[9px] font-bold text-ink leading-tight text-center truncate w-full font-tight tracking-tight">
                {p.name.split(' ').pop()}
              </span>
              <span className={`text-[8px] font-bold px-1 py-0.5 rounded-sm leading-none ${badgeClasses(p.playerScore)}`}>
                {p.playerScore.toFixed(0)}
              </span>
            </div>
          );
        }
        return (
          <div
            key={i}
            aria-hidden="true"
            className="flex flex-col items-center justify-center p-1.5 rounded-md border border-dashed border-hairline min-h-[56px]"
          >
            <span className="text-[10px] text-faint font-tight">—</span>
          </div>
        );
      })}
    </div>
  );
}

// Spinning team display — shows during the slot-machine phase.
function SpinDisplay({
  displayed,
  spinning,
}: {
  displayed: TwelveOhTeamYear | null;
  spinning: boolean;
}) {
  const meta = displayed ? teamMeta(displayed.teamSlug) : null;

  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-3 py-8 px-4',
        'transition-opacity duration-75',
        spinning && displayed ? 'opacity-70' : 'opacity-100',
      ].join(' ')}
      aria-live="polite"
      aria-atomic="true"
    >
      {/* Team mark */}
      <div
        className={[
          'w-24 h-24 rounded-2xl flex items-center justify-center',
          'transition-all duration-75',
          spinning ? 'scale-95' : 'scale-100',
        ].join(' ')}
      >
        {meta ? (
          <TeamLogo team={meta} size={96} className="rounded-xl" />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-surface border border-border" />
        )}
      </div>

      {/* Team label */}
      <div className="text-center">
        <p className="font-display text-3xl font-bold text-ink tracking-tight leading-none">
          {meta ? `${meta.city} ${meta.name ?? ''}` : (displayed ? displayed.teamAbbr : '——')}
        </p>
        {displayed && (
          <p className="text-sm text-muted font-tight mt-1">
            {displayed.year} Season
          </p>
        )}
      </div>
    </div>
  );
}

// Player card for the pick screen.
function PlayerCard({
  player,
  onPick,
  drafted,
  hideStats = false,
}: {
  player: TwelveOhPlayer;
  onPick: () => void;
  drafted: boolean;
  hideStats?: boolean;
}) {
  const label = scoreLabel(player.playerScore);
  const badge = badgeClasses(player.playerScore);

  // In UltIQ mode, drop the score from the aria-label so screen readers don't
  // leak the stat signal that the visual UI intentionally hides.
  const ariaLabel = hideStats
    ? `${drafted ? 'Already drafted' : 'Draft'} ${player.name}`
    : `${drafted ? 'Already drafted' : 'Draft'} ${player.name} — score ${player.playerScore.toFixed(0)}`;

  return (
    <button
      type="button"
      onClick={drafted ? undefined : onPick}
      disabled={drafted}
      aria-label={ariaLabel}
      className={[
        'w-full text-left rounded-xl border transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'cursor-pointer',
        drafted
          ? 'border-hairline bg-surface/40 opacity-50 cursor-not-allowed'
          : 'border-border bg-surface hover:border-accent/60 hover:bg-surface active:scale-[0.99]',
      ].join(' ')}
    >
      {hideStats ? (
        /* ── UltIQ variant: name only, no score/badge/stats ── */
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 min-h-[52px]">
          <span className="font-tight font-bold text-[15px] text-ink leading-tight">
            {player.name}
          </span>
          {drafted && (
            <span className="text-[9px] font-bold tracking-[0.1em] text-faint uppercase flex-shrink-0">
              Drafted
            </span>
          )}
        </div>
      ) : (
        /* ── Classic variant: score + badge + stats ── */
        <div className="flex items-start gap-3 p-3 sm:p-4">
          {/* Score — big number, left column */}
          <div className="flex-shrink-0 flex flex-col items-center gap-1 w-12">
            <span className="font-display text-2xl font-bold text-ink leading-none tabular">
              {player.playerScore.toFixed(0)}
            </span>
            <span className={`text-[8px] font-bold tracking-[0.1em] uppercase px-1.5 py-0.5 rounded-sm leading-none text-center ${badge}`}>
              {label}
            </span>
          </div>

          {/* Player info + stats */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="font-tight font-bold text-[14px] text-ink truncate leading-tight">
                {player.name}
              </span>
              {drafted && (
                <span className="text-[9px] font-bold tracking-[0.1em] text-faint uppercase flex-shrink-0">
                  Drafted
                </span>
              )}
            </div>

            {/* Key stats row */}
            <div className="grid grid-cols-5 gap-1">
              <StatCell label="G" value={player.goals} />
              <StatCell label="A" value={player.assists} />
              <StatCell label="Blk" value={player.blocks} />
              <StatCell label="Cmp%" value={fmtPct(player.completionPct)} />
              <StatCell label="ThYd" value={player.yardsThrown.toLocaleString()} />
            </div>
          </div>
        </div>
      )}
    </button>
  );
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-bold tabular text-ink leading-none">
        {value}
      </span>
      <span className="text-[8px] font-tight text-faint uppercase tracking-[0.08em] leading-none">
        {label}
      </span>
    </div>
  );
}

// Result screen.
function ResultScreen({
  roster,
  onPlayAgain,
}: {
  roster: DraftedPlayer[];
  onPlayAgain: () => void;
}) {
  const scores = roster.map((p) => p.playerScore);
  const { wins, losses, rationale } = teamRecord(scores);
  const isPerfect = wins === 12;
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;

  return (
    <div className="flex flex-col items-center gap-8 py-8 px-4 max-w-xl mx-auto w-full">
      {/* Record — the money moment */}
      <div
        className={[
          'text-center relative',
          isPerfect ? 'animate-pulse-once' : '',
        ].join(' ')}
        aria-live="assertive"
        aria-label={`Final record: ${wins} wins, ${losses} losses`}
      >
        {isPerfect && (
          <div
            className="absolute inset-0 -m-6 rounded-2xl bg-accent/10 border border-accent/30"
            aria-hidden="true"
          />
        )}
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-2 relative z-10">
          {isPerfect ? 'Perfect Season' : 'Season Record'}
        </p>
        <p
          className={[
            'font-display font-bold leading-none relative z-10',
            isPerfect ? 'text-7xl sm:text-8xl text-accent' : 'text-6xl sm:text-7xl text-ink',
          ].join(' ')}
        >
          {wins}–{losses}
        </p>
        {isPerfect && (
          <p className="text-[12px] font-bold tracking-[0.2em] uppercase text-accent font-tight mt-2 relative z-10">
            Undefeated · 12-0
          </p>
        )}
        <p className="text-sm text-muted font-tight mt-3 max-w-[280px] mx-auto relative z-10">
          {rationale}
        </p>
      </div>

      {/* Aggregate strength bar */}
      <div className="w-full max-w-[280px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
            Team Strength
          </span>
          <span className="text-[10px] font-bold tabular text-ink font-tight">
            {mean.toFixed(1)} avg
          </span>
        </div>
        <div className="h-2 rounded-full bg-surface border border-hairline overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all duration-700 ease-out"
            style={{ width: `${Math.min(100, mean)}%` }}
          />
        </div>
      </div>

      {/* Roster breakdown */}
      <div className="w-full">
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight mb-3">
          Your 7-Man Roster
        </p>
        <div className="flex flex-col gap-2">
          {roster.map((p) => {
            const meta = teamMeta(p.teamSlug);
            const badge = badgeClasses(p.playerScore);
            return (
              <div
                key={p._key}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface border border-border"
              >
                {meta && <TeamLogo team={meta} size={28} />}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-tight font-bold text-ink leading-tight truncate">
                    {p.name}
                  </p>
                  <p className="text-[10px] text-muted font-tight">
                    {p.teamAbbr} · {p.year}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="font-display font-bold text-lg text-ink leading-none tabular">
                    {p.playerScore.toFixed(0)}
                  </span>
                  <span className={`text-[8px] font-bold tracking-[0.08em] uppercase px-1.5 py-0.5 rounded-sm leading-none ${badge}`}>
                    {scoreLabel(p.playerScore)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Play again */}
      <button
        type="button"
        onClick={onPlayAgain}
        className={[
          'inline-flex items-center justify-center px-8 py-3.5 rounded-xl',
          'text-[12px] font-bold tracking-[0.16em] uppercase font-tight',
          'bg-accent text-accent-ink',
          'hover:opacity-90 active:scale-[0.98] transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'min-h-[52px] cursor-pointer',
        ].join(' ')}
      >
        Play Again
      </button>
    </div>
  );
}

// ─── Main game component ────────────────────────────────────────────────────

interface TwelveOhGameProps {
  teamYears: TwelveOhTeamYear[];
}

export function TwelveOhGame({ teamYears }: TwelveOhGameProps) {
  const [phase, setPhase] = useState<GamePhase>('mode-select');
  const [mode, setMode] = useState<GameMode | null>(null);
  const [roster, setRoster] = useState<DraftedPlayer[]>([]);
  const [currentTeamYear, setCurrentTeamYear] = useState<TwelveOhTeamYear | null>(null);
  const [currentRoster, setCurrentRoster] = useState<TwelveOhPlayer[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [skipsUsed, setSkipsUsed] = useState(0);
  const [rosterError, setRosterError] = useState<string | null>(null);
  // Whether we are animating (controls the spin hook)
  const [animating, setAnimating] = useState(false);

  // Prefer-reduced-motion check.
  const prefersReducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  // Deduplicate picked players by playerId|teamSlug|year (same human in a
  // different season is a different entry and allowed).
  const draftedKeys = new Set(roster.map((p) => p._key));

  // Called when the spin animation lands on a team-year.
  const handleSpinLand = useCallback(
    async (ty: TwelveOhTeamYear) => {
      setCurrentTeamYear(ty);
      setPhase('loading');
      setAnimating(false);
      try {
        const players = await getRoster(ty.teamSlug, ty.year);
        setCurrentRoster(players);
        setPhase('pick');
        setRosterError(null);
      } catch {
        setRosterError('Could not load roster — try spinning again.');
        setPhase('spin');
      }
    },
    [],
  );

  // Spin button handler.
  const handleSpin = useCallback(() => {
    if (teamYears.length === 0) return;
    setRosterError(null);

    if (prefersReducedMotion) {
      // Skip animation — pick immediately.
      const target = teamYears[Math.floor(Math.random() * teamYears.length)];
      handleSpinLand(target);
    } else {
      setSpinning(true);
      setAnimating(true);
      // The useSpinAnimation hook handles timing and calls onLand.
    }
  }, [teamYears, prefersReducedMotion, handleSpinLand]);

  // When animation lands (called from hook via onLand).
  const handleAnimationLand = useCallback(
    (ty: TwelveOhTeamYear) => {
      setSpinning(false);
      handleSpinLand(ty);
    },
    [handleSpinLand],
  );

  // Pick a player → add to roster.
  const handlePick = useCallback(
    (player: TwelveOhPlayer) => {
      const key = `${player.playerId}|${player.teamSlug}|${player.year}`;
      if (draftedKeys.has(key)) return;

      const drafted: DraftedPlayer = { ...player, _key: key };
      const newRoster = [...roster, drafted];
      setRoster(newRoster);

      if (newRoster.length >= ROSTER_SIZE) {
        setPhase('result');
      } else {
        // Back to spin for next pick.
        setPhase('spin');
        setCurrentTeamYear(null);
        setCurrentRoster([]);
      }
    },
    [roster, draftedKeys],
  );

  // Re-spin without picking. Capped at MAX_SKIPS per game so you can't just
  // re-roll until you land on an all-time-great team.
  const handleRespin = useCallback(() => {
    setSkipsUsed((n) => {
      if (n >= MAX_SKIPS) return n; // no-op once exhausted
      setPhase('spin');
      setCurrentTeamYear(null);
      setCurrentRoster([]);
      return n + 1;
    });
  }, []);

  // Play again — full reset, return to mode select so the user can re-choose.
  const handlePlayAgain = useCallback(() => {
    setRoster([]);
    setCurrentTeamYear(null);
    setCurrentRoster([]);
    setMode(null);
    setPhase('mode-select');
    setSpinning(false);
    setSkipsUsed(0);
    setRosterError(null);
    setAnimating(false);
  }, []);

  // Spin animation hook — only active when animating=true.
  const displayedTeamYear = useSpinAnimation(
    teamYears,
    animating,
    handleAnimationLand,
  );

  const picksMade = roster.length;
  const isUltIQ = mode === 'ultiq';

  // UltIQ: sort alphabetically by first name (then full name as tiebreak).
  // Classic: currentRoster already arrives score-DESC from getRoster — don't mutate.
  const displayRoster = isUltIQ
    ? [...currentRoster].sort((a, b) => {
        const aFirst = a.name.split(' ')[0].toLowerCase();
        const bFirst = b.name.split(' ')[0].toLowerCase();
        if (aFirst !== bFirst) return aFirst < bFirst ? -1 : 1;
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
      })
    : currentRoster;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* ── Page header — hidden on mode-select (the intro screen has its own
          12-0 hero, so this top ribbon is redundant there). During play it
          carries the draft-progress counter + roster tray. ─────────────── */}
      {phase !== 'mode-select' && (
        <div className="border-b border-hairline px-4 py-4 sm:px-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-4xl sm:text-5xl font-bold text-ink leading-none tracking-tight">
                  12-0
                </h1>
                <p className="text-[12px] text-muted font-tight mt-1 max-w-[280px]">
                  Spin for a team and season. Draft 7 players. Can you go undefeated?
                </p>
              </div>
              <div className="flex-shrink-0 flex flex-col items-end">
                <span className="font-display text-2xl font-bold text-ink leading-none tabular">
                  {picksMade}<span className="text-faint text-xl">/{ROSTER_SIZE}</span>
                </span>
                <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-muted font-tight mt-0.5">
                  Drafted
                </span>
              </div>
            </div>

            {/* Roster tray — only shown once drafting has begun */}
            {picksMade > 0 && (
              <div className="mt-4">
                <RosterTray roster={roster} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Phase content ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">

          {/* MODE SELECT phase */}
          {phase === 'mode-select' && (
            <div className="flex flex-col gap-8 py-4 sm:py-8">
              {/* Hero */}
              <div className="text-center">
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted font-tight mb-3">
                  UFA Draft Challenge
                </p>
                <h2 className="font-display text-4xl sm:text-5xl font-bold text-ink leading-none tracking-tight">
                  Can you go{' '}
                  <span className="text-accent">12-0?</span>
                </h2>
                <p className="text-sm text-muted font-tight mt-3 max-w-[320px] mx-auto">
                  Spin for a random team and season. Draft 7 players. Build the best all-time roster you can.
                </p>
                <p className="text-[13px] font-bold text-ink font-tight mt-5">
                  Choose your mode
                </p>
              </div>

              {/* Mode cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Classic card */}
                <button
                  type="button"
                  onClick={() => { setMode('classic'); setPhase('spin'); }}
                  className={[
                    'group flex flex-col gap-4 p-5 rounded-xl text-left',
                    'bg-surface border border-border',
                    'hover:border-accent/50 hover:shadow-sm',
                    'motion-safe:transition-all motion-safe:duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    'min-h-[180px] cursor-pointer',
                  ].join(' ')}
                >
                  {/* Icon */}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                        className="text-accent"
                      >
                        {/* Bar chart / stats icon */}
                        <rect x="2" y="11" width="3" height="7" rx="1" fill="currentColor" />
                        <rect x="7" y="7" width="3" height="11" rx="1" fill="currentColor" />
                        <rect x="12" y="4" width="3" height="14" rx="1" fill="currentColor" />
                        <rect x="17" y="9" width="1" height="9" rx="0.5" fill="currentColor" opacity="0.4" />
                      </svg>
                    </div>
                    {/* Arrow hint */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className="text-faint group-hover:text-accent motion-safe:transition-colors motion-safe:duration-150"
                    >
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Text */}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-display text-xl font-bold text-ink leading-tight tracking-tight">
                      Classic
                    </span>
                    <span className="text-[13px] text-muted font-tight leading-snug">
                      Draft with full player stats visible — make informed picks.
                    </span>
                  </div>

                  {/* CTA */}
                  <div className="mt-auto pt-2">
                    <span className={[
                      'inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg',
                      'text-[11px] font-bold tracking-[0.12em] uppercase font-tight',
                      'bg-accent text-accent-ink',
                      'group-hover:opacity-90 motion-safe:transition-opacity motion-safe:duration-150',
                      'min-h-[44px]',
                    ].join(' ')}>
                      Play Classic
                    </span>
                  </div>
                </button>

                {/* UltIQ card */}
                <button
                  type="button"
                  onClick={() => { setMode('ultiq'); setPhase('spin'); }}
                  className={[
                    'group flex flex-col gap-4 p-5 rounded-xl text-left',
                    'bg-surface border border-border',
                    'hover:border-accent/50 hover:shadow-sm',
                    'motion-safe:transition-all motion-safe:duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    'min-h-[180px] cursor-pointer',
                  ].join(' ')}
                >
                  {/* Icon */}
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                        className="text-accent"
                      >
                        {/* Head/brain outline with question mark concept */}
                        <circle cx="10" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M10 13v1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="10" cy="16.5" r="0.75" fill="currentColor" />
                        {/* Small lines suggesting hidden/masked content */}
                        <path d="M7.5 7.5h1m2 0h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                        <path d="M7.5 9.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
                      </svg>
                    </div>
                    {/* Arrow hint */}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className="text-faint group-hover:text-accent motion-safe:transition-colors motion-safe:duration-150"
                    >
                      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Text */}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-display text-xl font-bold text-ink leading-tight tracking-tight">
                      UltIQ
                    </span>
                    <span className="text-[13px] text-muted font-tight leading-snug">
                      Stats hidden — draft by memory and test your ultimate IQ.
                    </span>
                  </div>

                  {/* CTA */}
                  <div className="mt-auto pt-2">
                    <span className={[
                      'inline-flex items-center justify-center w-full px-4 py-2.5 rounded-lg',
                      'text-[11px] font-bold tracking-[0.12em] uppercase font-tight',
                      'bg-accent text-accent-ink',
                      'group-hover:opacity-90 motion-safe:transition-opacity motion-safe:duration-150',
                      'min-h-[44px]',
                    ].join(' ')}>
                      Play UltIQ
                    </span>
                  </div>
                </button>
              </div>

              {/* Footer hint */}
              <p className="text-center text-[10px] text-faint font-tight tracking-[0.08em]">
                Both modes reveal full stats + record at the end
              </p>
            </div>
          )}

          {/* SPIN phase */}
          {phase === 'spin' && (
            <div className="flex flex-col items-center gap-6">
              {/* Spin display zone */}
              <div className="w-full flex flex-col items-center">
                {(displayedTeamYear || spinning) ? (
                  <SpinDisplay
                    displayed={displayedTeamYear}
                    spinning={spinning}
                  />
                ) : (
                  /* Idle state — show the spin prompt */
                  <div className="flex flex-col items-center gap-3 py-12 opacity-50">
                    {/* Slot-machine glyph */}
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 48 48"
                      fill="none"
                      aria-hidden="true"
                      className="text-muted"
                    >
                      <rect x="8" y="12" width="32" height="26" rx="3" stroke="currentColor" strokeWidth="2" />
                      <rect x="14" y="18" width="6" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="21" y="18" width="6" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="28" y="18" width="6" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <line x1="18" y1="6" x2="18" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="24" y1="4" x2="24" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="30" y1="6" x2="30" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <p className="text-[12px] font-tight text-muted text-center max-w-[220px]">
                      {picksMade === 0
                        ? 'Spin to get your first team'
                        : `${ROSTER_SIZE - picksMade} more pick${ROSTER_SIZE - picksMade === 1 ? '' : 's'} to go`}
                    </p>
                  </div>
                )}
              </div>

              {rosterError && (
                <p
                  className="text-[12px] text-center text-muted font-tight rounded-lg bg-surface border border-border px-4 py-3 w-full max-w-xs"
                  role="alert"
                >
                  {rosterError}
                </p>
              )}

              {/* SPIN button */}
              <button
                type="button"
                onClick={handleSpin}
                disabled={spinning || phase !== 'spin'}
                aria-label="Spin for a random team and season"
                aria-busy={spinning}
                className={[
                  'inline-flex items-center justify-center gap-2 px-10 py-4 rounded-2xl',
                  'font-display text-2xl font-bold tracking-wide',
                  'min-h-[64px] min-w-[160px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  'transition-all duration-150',
                  'cursor-pointer',
                  spinning
                    ? 'bg-accent/60 text-accent-ink cursor-wait scale-95'
                    : 'bg-accent text-accent-ink hover:opacity-90 active:scale-[0.97]',
                ].join(' ')}
              >
                {spinning ? (
                  <>
                    {/* Spinning loader SVG */}
                    <svg
                      className="animate-spin"
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        cx="10" cy="10" r="8"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeOpacity="0.3"
                      />
                      <path
                        d="M10 2a8 8 0 0 1 8 8"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    Spinning…
                  </>
                ) : (
                  'SPIN'
                )}
              </button>
            </div>
          )}

          {/* LOADING phase */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-16" aria-live="polite">
              {currentTeamYear && (() => {
                const meta = teamMeta(currentTeamYear.teamSlug);
                return (
                  <div className="flex flex-col items-center gap-3">
                    {meta && <TeamLogo team={meta} size={72} className="rounded-xl" />}
                    <p className="font-display text-2xl font-bold text-ink">
                      {meta ? `${meta.city} ${meta.name ?? ''}` : currentTeamYear.teamAbbr}
                    </p>
                    <p className="text-sm text-muted font-tight">{currentTeamYear.year} Season</p>
                  </div>
                );
              })()}
              <div className="flex items-center gap-2 text-muted text-[12px] font-tight mt-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                  <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Loading roster…
              </div>
            </div>
          )}

          {/* PICK phase */}
          {phase === 'pick' && currentTeamYear && (
            <div className="flex flex-col gap-5">
              {/* Team header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {(() => {
                    const meta = teamMeta(currentTeamYear.teamSlug);
                    return meta ? <TeamLogo team={meta} size={40} className="rounded-lg" /> : null;
                  })()}
                  <div>
                    {(() => {
                      const meta = teamMeta(currentTeamYear.teamSlug);
                      return (
                        <p className="font-display font-bold text-xl text-ink leading-tight">
                          {meta
                            ? `${meta.city} ${meta.name ?? ''}`
                            : currentTeamYear.teamAbbr}
                        </p>
                      );
                    })()}
                    <p className="text-[11px] text-muted font-tight">
                      {currentTeamYear.year} · {currentRoster.length} players
                    </p>
                  </div>
                </div>

                {/* Skip / re-spin — capped at MAX_SKIPS per game */}
                {(() => {
                  const skipsLeft = MAX_SKIPS - skipsUsed;
                  const canSkip = skipsLeft > 0;
                  return (
                    <button
                      type="button"
                      onClick={handleRespin}
                      disabled={!canSkip}
                      aria-label={canSkip ? `Skip this team (${skipsLeft} skip left)` : 'No skips left'}
                      className={[
                        'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg',
                        'text-[11px] font-bold tracking-[0.1em] uppercase font-tight',
                        'border transition-colors duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        'min-h-[44px]',
                        canSkip
                          ? 'text-muted border-border hover:border-accent/40 hover:text-ink cursor-pointer'
                          : 'text-faint border-hairline opacity-60 cursor-not-allowed',
                      ].join(' ')}
                    >
                      {/* Re-spin icon */}
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                        <path
                          d="M10 6A4 4 0 1 1 6 2v2m0-2h2M6 2 4 4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {canSkip ? `Skip · ${skipsLeft} left` : 'No skips left'}
                    </button>
                  );
                })()}
              </div>

              {/* Instruction line */}
              <p className="text-[11px] text-muted font-tight -mt-2">
                {isUltIQ
                  ? `Pick by memory — no stats shown. (${picksMade}/${ROSTER_SIZE} drafted)`
                  : `Pick 1 player to add to your roster (${picksMade}/${ROSTER_SIZE} drafted)`}
              </p>

              {/* Stat legend — Classic only */}
              {!isUltIQ && (
                <div className="flex items-center gap-3 text-[9px] font-bold tracking-[0.1em] uppercase text-faint font-tight border-b border-hairline pb-2 -mt-1">
                  <span>Score</span>
                  <span>·</span>
                  <span>G = Goals</span>
                  <span>A = Assists</span>
                  <span>Blk = Blocks</span>
                  <span>Cmp% = Completion</span>
                  <span>ThYd = Throw Yds</span>
                </div>
              )}

              {/* Player list */}
              <div className="flex flex-col gap-2">
                {displayRoster.map((player) => {
                  const key = `${player.playerId}|${player.teamSlug}|${player.year}`;
                  const isDrafted = draftedKeys.has(key);
                  return (
                    <PlayerCard
                      key={key}
                      player={player}
                      onPick={() => handlePick(player)}
                      drafted={isDrafted}
                      hideStats={isUltIQ}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* RESULT phase */}
          {phase === 'result' && (
            <ResultScreen roster={roster} onPlayAgain={handlePlayAgain} />
          )}
        </div>
      </div>
    </div>
  );
}
