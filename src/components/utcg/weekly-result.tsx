'use client';

// WeeklyResult — outcome screen for a Weekly Brawl or Featured Boss play.
// Same shell idiom as PvpResult (Shell/PrimaryButton/SecondaryButton), but
// simpler: one squad vs one bar (the Brawl target or the boss's strength),
// no stakes. A win on the FIRST win of the week returns a reward pack to open
// immediately; replays after that win no longer pay a pack (server-decided —
// `rewardPackId` is simply null).

import type { WeeklyPlayResult } from '@/lib/utcg/brawl';
import { CoinGlyph } from '@/components/utcg/coin-glyph';

interface WeeklyResultProps {
  mode: 'brawl' | 'boss';
  result: WeeklyPlayResult | null;
  error: string | null;
  onOpenRewardPack: (id: string) => void;
  openingReward: boolean;
  onPlayAgain: () => void;
  onBackToPlay: () => void;
}

export function WeeklyResult({
  mode,
  result,
  error,
  onOpenRewardPack,
  openingReward,
  onPlayAgain,
  onBackToPlay,
}: WeeklyResultProps) {
  const modeLabel = mode === 'brawl' ? 'Weekly Brawl' : 'Featured Boss';

  if (error) {
    return (
      <Shell modeLabel={modeLabel} title="Couldn't submit" tone="neutral">
        <p className="text-[13px] text-muted font-tight text-center max-w-[340px] mx-auto" role="alert">
          {error}
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
          <SecondaryButton onClick={onBackToPlay}>Back</SecondaryButton>
        </div>
      </Shell>
    );
  }

  if (!result) {
    return (
      <Shell modeLabel={modeLabel} title="Playing…" tone="neutral">
        <p className="text-[13px] text-muted font-tight text-center">Submitting your squad…</p>
      </Shell>
    );
  }

  const { won, strength, chem, bar, rewardPackId } = result;

  return (
    <Shell modeLabel={modeLabel} title={won ? 'You win' : 'Not quite'} tone={won ? 'win' : 'loss'}>
      <p className="text-[13px] text-muted font-tight text-center">
        {mode === 'brawl'
          ? won
            ? `Your squad cleared this week's target.`
            : `Strength fell short of this week's target.`
          : won
            ? `Your squad beat the boss's strength.`
            : `The boss's strength held — beat it strictly to win.`}
      </p>

      <div className="grid grid-cols-2 gap-2 max-w-[380px] mx-auto w-full">
        <SideStat label="Your squad" value={strength.toFixed(1)} highlight={won} />
        <SideStat label={mode === 'brawl' ? 'Target' : 'Boss strength'} value={bar.toFixed(1)} highlight={!won} />
      </div>

      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink/5 text-muted text-[12px] font-bold tabular font-tight">
          Chemistry {chem}/21
        </span>
      </div>

      {rewardPackId && (
        <div className="rounded-card bg-surface shadow-card p-4 flex items-center justify-between gap-3 max-w-[380px] mx-auto w-full">
          <div>
            <p className="text-[12.5px] font-bold text-ink font-tight">First win this week</p>
            <p className="text-[11px] text-faint font-tight">A reward pack is waiting.</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenRewardPack(rewardPackId)}
            disabled={openingReward}
            className={[
              'inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full flex-shrink-0 min-h-[44px]',
              'text-[11px] font-bold tracking-[0.1em] uppercase font-tight',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'motion-safe:transition-opacity motion-safe:duration-150',
              openingReward ? 'bg-accent/60 text-accent-ink cursor-wait' : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
            ].join(' ')}
          >
            <CoinGlyph size={12} />
            {openingReward ? 'Opening…' : 'Open pack'}
          </button>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
        <PrimaryButton onClick={onPlayAgain}>Play again</PrimaryButton>
        <SecondaryButton onClick={onBackToPlay}>Done</SecondaryButton>
      </div>
    </Shell>
  );
}

function Shell({
  modeLabel,
  title,
  tone,
  children,
}: {
  modeLabel: string;
  title: string;
  tone: 'win' | 'loss' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 py-4 sm:py-8 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted font-tight mb-1.5">{modeLabel}</p>
        <h2
          className={[
            'font-display italic text-3xl sm:text-5xl font-bold leading-[0.95] tracking-[-0.02em]',
            tone === 'win' ? 'text-accent' : 'text-ink',
          ].join(' ')}
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function SideStat({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
  return (
    <div className={['rounded-card bg-surface shadow-card p-3.5 flex flex-col gap-1', highlight ? 'ring-2 ring-accent' : ''].join(' ')}>
      <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted font-tight">{label}</span>
      <span className="font-display italic text-2xl font-bold text-ink leading-none tabular">{value}</span>
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-5 min-h-[40px] rounded-full bg-ink text-bg text-[12px] font-bold tracking-[0.06em] uppercase font-tight cursor-pointer motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-5 min-h-[40px] rounded-full bg-ink/5 text-ink text-[12px] font-bold tracking-[0.06em] uppercase font-tight cursor-pointer hover:bg-ink/10 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}
