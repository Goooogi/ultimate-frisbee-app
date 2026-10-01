'use client';

// RivalsResult — outcome screen for a Rivals entry.
//
// Same two-shape idiom as PvpResult (queued/resolved), but Rivals is
// UNSTAKED — no coins move, so this mirrors WeeklyResult's simpler shell
// (Shell/PrimaryButton/SecondaryButton) instead of PvpResult's coin-laden
// copy. Win 3 / draw 1 / loss 0 points, both sides score (mirror of
// utcg_rivals_enter — rivals.ts has no exported constant for this, so it's
// kept here as the single display mirror).

import { RIVALS_POINTS, type RivalsOutcome } from '@/lib/utcg/rivals';

/** Weekly points awarded per Rivals result. Mirror of utcg_rivals_enter — not
 *  exported from rivals.ts, so this is the one place that duplicates it. */

interface RivalsResultProps {
  outcome: RivalsOutcome | null;
  /** Set when the RPC threw. */
  error: string | null;
  onPlayAgain: () => void;
  onBackToPlay: () => void;
  /** Withdraw an unplayed challenge (no stake to refund — Rivals is unstaked). */
  onCancel: () => void;
  cancelling: boolean;
}

export function RivalsResult({
  outcome,
  error,
  onPlayAgain,
  onBackToPlay,
  onCancel,
  cancelling,
}: RivalsResultProps) {
  if (error) {
    return (
      <Shell title="Couldn't enter" tone="neutral">
        <p className="text-[13px] text-muted font-tight text-center max-w-[340px] mx-auto" role="alert">
          {error}
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap mt-1">
          <SecondaryButton onClick={onBackToPlay}>Back</SecondaryButton>
        </div>
      </Shell>
    );
  }

  if (!outcome) {
    return (
      <Shell title="Entering…" tone="neutral">
        <p className="text-[13px] text-muted font-tight text-center">Finding an opponent…</p>
      </Shell>
    );
  }

  if (outcome.status === 'queued') {
    return (
      <Shell title="Squad parked" tone="neutral">
        <p className="text-[13px] text-muted font-tight text-center max-w-[380px] mx-auto">
          Nobody&rsquo;s waiting right now, so your squad is parked as the open Rivals challenge.
          It scores points for you even while you&rsquo;re away — you&rsquo;ll see the result here
          once someone plays it.
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Stat label="Your strength" value={outcome.strength.toFixed(1)} />
          <Stat label="Chemistry" value={`${outcome.chem}/21`} />
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
            {cancelling ? 'Withdrawing…' : 'Withdraw squad'}
          </button>
        </div>
      </Shell>
    );
  }

  const won = outcome.outcome === 'challenger';
  const drew = outcome.outcome === 'draw';
  const title = drew ? 'Dead heat' : won ? 'You win' : 'You lose';
  const tone = drew ? 'neutral' : won ? 'win' : 'loss';
  const points = won ? RIVALS_POINTS.win : drew ? RIVALS_POINTS.draw : RIVALS_POINTS.loss;

  return (
    <Shell title={title} tone={tone}>
      <p className="text-[13px] text-muted font-tight text-center">
        {drew ? 'Identical squads down to the last decimal.' : `Decided on ${DECIDED_COPY[outcome.decidedBy]}.`}
      </p>

      <div className="grid grid-cols-2 gap-2 max-w-[380px] mx-auto w-full">
        <SideCard label="You" strength={outcome.strength} chem={outcome.chem} highlight={won && !drew} />
        <SideCard label="Opponent" strength={outcome.opponentStrength} chem={outcome.opponentChem} highlight={!won && !drew} />
      </div>

      <div className="flex items-center justify-center">
        <span
          className={[
            'inline-flex items-center gap-1.5 px-4 py-2 rounded-full',
            'text-[13px] font-extrabold tabular font-tight',
            points > 0 ? 'bg-accent text-accent-ink' : 'bg-ink/5 text-muted',
          ].join(' ')}
        >
          {points > 0 ? `+${points} pts` : '+0 pts'}
          <span className="font-semibold opacity-70">this week&rsquo;s total: {outcome.weekPoints}</span>
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

function Shell({ title, tone, children }: { title: string; tone: 'win' | 'loss' | 'neutral'; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 py-4 sm:py-8 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted font-tight mb-1.5">Rivals</p>
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

function SideCard({ label, strength, chem, highlight }: { label: string; strength: number; chem: number; highlight: boolean }) {
  return (
    <div className={['rounded-card bg-surface shadow-card p-3.5 flex flex-col gap-1', highlight ? 'ring-2 ring-accent' : ''].join(' ')}>
      <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted font-tight">{label}</span>
      <span className="font-display italic text-2xl font-bold text-ink leading-none tabular">{strength.toFixed(1)}</span>
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
