'use client';

// PvpResult — outcome screen for a PvP entry.
//
// Two shapes, because PvP matchmaking is async:
//   * QUEUED — nobody was waiting, so this squad became the open challenge and
//     the stake is escrowed. It resolves as soon as another player enters.
//   * RESOLVED — played an opponent's stored squad immediately. Shows both
//     sides' strength AND chemistry, since either can decide it, plus which
//     rule actually did (`decidedBy`).
//
// Deliberately separate from MatchResult: that screen is built around a 12-game
// simulated record, which has no meaning for a single head-to-head.

import type { PvpOutcome } from '@/lib/utcg/actions';
import { CoinGlyph } from '@/components/utcg/coin-glyph';

interface PvpResultProps {
  outcome: PvpOutcome | null;
  /** Set when the RPC threw — no coins were staked. */
  error: string | null;
  onPlayAgain: () => void;
  onBackToPlay: () => void;
  onGoToPacks: () => void;
  /** Withdraw an unplayed challenge and refund the stake. */
  onCancel: () => void;
  cancelling: boolean;
}

export function PvpResult({
  outcome,
  error,
  onPlayAgain,
  onBackToPlay,
  onGoToPacks,
  onCancel,
  cancelling,
}: PvpResultProps) {
  if (error) {
    const needsCoins = /insufficient/i.test(error);
    return (
      <Shell title="Couldn't enter" tone="neutral">
        <p className="text-[13px] text-muted font-tight text-center max-w-[340px] mx-auto" role="alert">
          {error}
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
          {needsCoins && <PrimaryButton onClick={onGoToPacks}>Open Packs</PrimaryButton>}
          <SecondaryButton onClick={onBackToPlay}>Back</SecondaryButton>
        </div>
      </Shell>
    );
  }

  if (!outcome) {
    return (
      <Shell title="Entering…" tone="neutral">
        <p className="text-[13px] text-muted font-tight text-center">Staking coins and finding an opponent…</p>
      </Shell>
    );
  }

  if (outcome.status === 'queued') {
    return (
      <Shell title="Squad staked" tone="neutral">
        <p className="text-[13px] text-muted font-tight text-center max-w-[380px] mx-auto">
          Nobody&rsquo;s waiting right now, so your squad is the open challenge. The next player to
          enter plays it — you&rsquo;ll see the result here when they do.
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Stat label="Your strength" value={outcome.strength.toFixed(1)} />
          <Stat label="Chemistry" value={`${outcome.chem}/21`} />
          <Stat
            label="Staked"
            value={
              <span className="inline-flex items-center gap-1">
                <CoinGlyph size={12} className="text-accent" />
                {outcome.stake}
              </span>
            }
          />
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
          <SecondaryButton onClick={onBackToPlay}>Done</SecondaryButton>
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className={[
              'px-5 min-h-[40px] rounded-full text-[12px] font-bold tracking-[0.06em] uppercase font-tight',
              'motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              cancelling
                ? 'bg-ink/5 text-faint cursor-not-allowed'
                : 'bg-transparent text-muted hover:text-ink cursor-pointer underline underline-offset-4',
            ].join(' ')}
          >
            {cancelling ? 'Withdrawing…' : `Withdraw · refund ${outcome.stake}`}
          </button>
        </div>
      </Shell>
    );
  }

  const won = outcome.outcome === 'challenger';
  const drew = outcome.outcome === 'draw';
  const title = drew ? 'Dead heat' : won ? 'You win' : 'You lose';
  const tone = drew ? 'neutral' : won ? 'win' : 'loss';

  return (
    <Shell title={title} tone={tone}>
      <p className="text-[13px] text-muted font-tight text-center">
        {drew
          ? 'Identical squads down to the last decimal — both stakes refunded.'
          : `Decided on ${DECIDED_COPY[outcome.decidedBy]}.`}
      </p>

      <div className="grid grid-cols-2 gap-2 max-w-[380px] mx-auto w-full">
        <SideCard
          label="You"
          strength={outcome.strength}
          chem={outcome.chem}
          highlight={won && !drew}
        />
        <SideCard
          label="Opponent"
          strength={outcome.opponentStrength}
          chem={outcome.opponentChem}
          highlight={!won && !drew}
        />
      </div>

      <div className="flex items-center justify-center">
        <span
          className={[
            'inline-flex items-center gap-1.5 px-4 py-2 rounded-full',
            'text-[13px] font-extrabold tabular font-tight',
            won ? 'bg-accent text-accent-ink' : 'bg-ink/5 text-muted',
          ].join(' ')}
        >
          <CoinGlyph size={14} className={won ? 'text-accent-ink' : 'text-faint'} />
          {won ? `+${outcome.payout - outcome.stake}` : drew ? '±0' : `−${outcome.stake}`}
          <span className="font-semibold opacity-70">
            {won ? `(pot ${outcome.pot})` : drew ? '(refunded)' : ''}
          </span>
        </span>
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
        <PrimaryButton onClick={onPlayAgain}>Play again</PrimaryButton>
        <SecondaryButton onClick={onBackToPlay}>Done</SecondaryButton>
      </div>
    </Shell>
  );
}

const DECIDED_COPY: Record<string, string> = {
  strength: 'overall strength',
  chem: 'chemistry — strength was level',
  mean: 'the scrappier squad — strength and chemistry were level',
  draw: 'nothing — a true draw',
};

function Shell({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'win' | 'loss' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 py-4 sm:py-8 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted font-tight mb-1.5">PvP</p>
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

function SideCard({
  label,
  strength,
  chem,
  highlight,
}: {
  label: string;
  strength: number;
  chem: number;
  highlight: boolean;
}) {
  return (
    <div
      className={[
        'rounded-card bg-surface shadow-card p-3.5 flex flex-col gap-1',
        highlight ? 'ring-2 ring-accent' : '',
      ].join(' ')}
    >
      <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted font-tight">{label}</span>
      <span className="font-display italic text-2xl font-bold text-ink leading-none tabular">
        {strength.toFixed(1)}
      </span>
      <span className="text-[11px] font-semibold text-faint font-tight tabular">Chem {chem}/21</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col items-center px-3.5 py-2 rounded-card bg-surface shadow-card">
      <span className="text-[9.5px] font-bold tracking-[0.1em] uppercase text-muted font-tight">{label}</span>
      <span className="text-[15px] font-extrabold text-ink tabular font-tight">{value}</span>
    </span>
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
