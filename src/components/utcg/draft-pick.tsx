'use client';

// DraftPick — the heart of Draft Mode. Full dark stage (same #0E1622
// language as the pack reveal): header shows which slot is being filled +
// progress dots for all 7, the server-dealt 5 candidates for THIS slot as
// rarity-ringed cards, and a running lineup strip at the bottom showing
// slots filled so far. Not from the user's collection — the server deals a
// fresh rarity-weighted 5 fitting the slot's position every time, so a Star
// or Elite candidate can show up for any slot (the draft fantasy).
//
// Pick gesture: tap a card to SELECT it (ring highlight + a "Confirm Pick"
// bar slides up), tap again (or tap Confirm) to lock it in. Two-step on
// purpose — a mis-tap here costs a card you can never get back, unlike the
// squad builder's collection-backed picks which can be swapped freely.

import { useEffect, useState } from 'react';
import type { DraftCard, DraftRun } from '@/lib/utcg/draft';
import type { FormationKey } from '@/lib/utcg/formations';
import { FORMATIONS } from '@/lib/utcg/formations';
import { CardTile } from '@/components/utcg/card-tile';
import { draftCardToUtcgCard } from '@/components/utcg/draft-card';

interface DraftPickProps {
  run: DraftRun;
  /** playerId → headshot URL, resolved client-side by UtcgGame (the deal
   *  payload carries no photos). Missing ids fall back to a monogram. */
  headshots: Map<string, string>;
  onPick: (index: number) => Promise<void>;
  onCashOut: () => void;
  picking: boolean;
  error: string | null;
}

function slotLabel(formation: FormationKey, slotIdx: number): { short: string; long: string } {
  const f = FORMATIONS[formation];
  const type = f.slots[slotIdx];
  const sameTypeBefore = f.slots.slice(0, slotIdx).filter((s) => s === type).length;
  const ordinal = sameTypeBefore + 1;
  const short = `${type === 'handler' ? 'H' : 'C'}${ordinal}`;
  const long = type === 'handler' ? `Handler ${ordinal}` : `Cutter ${ordinal}`;
  return { short, long };
}

export function DraftPick({ run, headshots, onPick, onCashOut, picking, error }: DraftPickProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [showCashOutConfirm, setShowCashOutConfirm] = useState(false);

  // Reset local selection whenever the server hands us a new deal (new slot).
  useEffect(() => {
    setSelected(null);
    setConfirming(null);
  }, [run.slotIdx]);

  const { long: slotLong } = slotLabel(run.formation, run.slotIdx);
  const totalSlots = FORMATIONS[run.formation].slots.length;

  const handleCardTap = (index: number) => {
    if (picking) return;
    if (selected === index) {
      // Second tap on the already-selected card = confirm.
      setConfirming(index);
      onPick(index);
      return;
    }
    setSelected(index);
    try { navigator.vibrate?.(10); } catch { /* no-op */ }
  };

  const handleConfirmBar = () => {
    if (selected === null || picking) return;
    setConfirming(selected);
    onPick(selected);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: '#0E1622' }}
    >
      <div className="flex-1 flex flex-col px-4 sm:px-6 pt-7 pb-4 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <p className="text-[10px] font-bold tracking-[0.24em] uppercase text-white/45">
              Draft · {FORMATIONS[run.formation].name}
            </p>
            <h1 className="font-display italic text-2xl sm:text-3xl font-bold text-white leading-[0.95] tracking-[-0.02em] mt-1">
              Pick Your {slotLong}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setShowCashOutConfirm(true)}
            className="flex-shrink-0 text-[9px] font-bold tracking-[0.16em] uppercase text-white/35 hover:text-white/60 motion-safe:transition-colors motion-safe:duration-150 px-3 min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm cursor-pointer"
          >
            Cash Out
          </button>
        </div>

        {/* Progress dots — 7 slots */}
        <div className="flex items-center gap-1.5 mt-4 mb-2" role="img" aria-label={`Slot ${run.slotIdx + 1} of ${totalSlots}`}>
          {Array.from({ length: totalSlots }, (_, i) => (
            <span
              key={i}
              className={[
                'h-1.5 rounded-full motion-safe:transition-all motion-safe:duration-300',
                i < run.slotIdx ? 'w-4 bg-accent' : i === run.slotIdx ? 'w-6 bg-white' : 'w-1.5 bg-white/20',
              ].join(' ')}
            />
          ))}
        </div>
        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40 tabular mb-4">
          Slot {run.slotIdx + 1} of {totalSlots}
        </p>

        {error && (
          <p className="text-[12px] text-center text-white/80 font-tight rounded-card bg-white/[0.06] px-4 py-3 mb-4" role="alert">
            {error}
          </p>
        )}

        {/* 5 dealt candidates — all on ONE row so the whole pick screen fits
            without scrolling and every card is the same size (the old 2/3-col
            grid left a lone, differently-sized 5th card and forced a scroll). */}
        <div className="grid grid-cols-5 gap-2 sm:gap-2.5 flex-1 content-start">
          {run.deals.map((candidate, i) => (
            <DraftCandidate
              key={`${candidate.playerId}|${candidate.teamSlug}|${candidate.year}|${i}`}
              candidate={candidate}
              headshotUrl={headshots.get(candidate.playerId) ?? null}
              selected={selected === i}
              locking={confirming === i}
              disabled={picking && confirming !== i}
              onTap={() => handleCardTap(i)}
            />
          ))}
        </div>

        {selected !== null && (
          <div className="sticky bottom-4 mt-4 motion-safe:animate-fade-up">
            <button
              type="button"
              onClick={handleConfirmBar}
              disabled={picking}
              className={[
                'w-full h-14 rounded-card bg-accent text-white text-[14px] font-extrabold tracking-[0.06em] uppercase',
                'shadow-[0_12px_30px_rgba(255,61,0,0.4)] flex items-center justify-center gap-2',
                'motion-safe:transition-opacity motion-safe:duration-150 cursor-pointer disabled:opacity-70 disabled:cursor-wait',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              ].join(' ')}
            >
              {picking ? (
                <>
                  <Spinner /> Locking In…
                </>
              ) : (
                <>Confirm {run.deals[selected]?.name}</>
              )}
            </button>
          </div>
        )}

        {/* Running lineup strip — the 7 slots filling up as picks land. */}
        <LineupStrip formation={run.formation} picks={run.picks} currentSlotIdx={run.slotIdx} />
      </div>

      {showCashOutConfirm && (
        <CashOutConfirm
          bank={0}
          onConfirm={() => {
            setShowCashOutConfirm(false);
            onCashOut();
          }}
          onCancel={() => setShowCashOutConfirm(false)}
          duringDraft
        />
      )}
    </div>
  );
}

function DraftCandidate({
  candidate,
  headshotUrl,
  selected,
  locking,
  disabled,
  onTap,
}: {
  candidate: DraftCard;
  headshotUrl: string | null;
  selected: boolean;
  locking: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  const card = draftCardToUtcgCard(candidate, headshotUrl);
  return (
    <div className="relative min-w-0">
      <CardTile card={card} onClick={disabled ? undefined : onTap} selected={selected} disabled={disabled && !locking} />
      {selected && !locking && (
        <span
          className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] font-extrabold tracking-[0.1em] uppercase text-white bg-accent px-2 py-1 rounded-full whitespace-nowrap shadow-lift"
          aria-hidden="true"
        >
          Tap to Confirm
        </span>
      )}
      {locking && (
        <div className="absolute inset-0 rounded-card bg-[#0E1622]/70 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <Spinner light />
        </div>
      )}
    </div>
  );
}

function Spinner({ light }: { light?: boolean }) {
  return (
    <svg className={`animate-spin w-4 h-4 ${light ? 'text-white' : ''}`} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
      <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ── Running lineup strip ────────────────────────────────────────────────

function LineupStrip({ formation, picks, currentSlotIdx }: { formation: FormationKey; picks: DraftCard[]; currentSlotIdx: number }) {
  const totalSlots = FORMATIONS[formation].slots.length;
  return (
    <div className="mt-8 pt-5 border-t border-white/10">
      <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/35 mb-3">Your Squad So Far</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: totalSlots }, (_, i) => {
          const pick = picks[i];
          const { short } = slotLabel(formation, i);
          const isNext = i === currentSlotIdx && !pick;
          return (
            <div
              key={i}
              className={[
                'flex-shrink-0 w-14 h-[74px] rounded-card-sm flex flex-col items-center justify-center gap-1',
                pick
                  ? 'bg-white/[0.06] motion-safe:animate-snap-in'
                  : isNext
                    ? 'bg-white/[0.08] shadow-[inset_0_0_0_1.5px_rgba(255,61,0,0.6)]'
                    : 'bg-white/[0.03]',
              ].join(' ')}
            >
              {pick ? (
                <>
                  <span className="font-display italic font-bold text-white text-sm tabular leading-none">{pick.playerScore.toFixed(0)}</span>
                  <span className="text-[7px] font-bold text-white/50 truncate max-w-full px-1">{pick.name.split(' ').pop()}</span>
                </>
              ) : (
                <span className={`text-[9px] font-bold uppercase tracking-[0.06em] ${isNext ? 'text-accent' : 'text-white/25'}`}>{short}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Cash-out confirm (shared with gauntlet screen) ───────────────────────

export function CashOutConfirm({
  bank,
  onConfirm,
  onCancel,
  duringDraft = false,
}: {
  bank: number;
  onConfirm: () => void;
  onCancel: () => void;
  /** True when cashing out mid-draft (before any gauntlet wins) — the copy
   *  changes since there may be nothing banked yet. */
  duringDraft?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 motion-safe:animate-fade-in" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirm cash out"
        className="relative z-10 w-full sm:max-w-sm rounded-t-card-lg sm:rounded-card-lg p-6 flex flex-col gap-4"
        style={{ background: '#161B22' }}
      >
        <h3 className="font-display italic text-2xl font-bold text-white leading-tight">
          Cash out now?
        </h3>
        <p className="text-[13px] text-white/60 leading-relaxed">
          {duringDraft
            ? 'Ending the draft now forfeits your entry fee and any cards you’ve picked — they never leave the draft. This can’t be undone.'
            : `Ending the run now banks your ${bank.toLocaleString()} coins and ends the gauntlet. This can’t be undone.`}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-12 rounded-card border-[1.5px] border-white/20 text-white text-[13px] font-bold tracking-[0.04em] cursor-pointer motion-safe:transition-colors motion-safe:duration-150 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Keep Going
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 h-12 rounded-card bg-white/10 text-white text-[13px] font-bold tracking-[0.04em] cursor-pointer motion-safe:transition-colors motion-safe:duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cash Out
          </button>
        </div>
      </div>
    </div>
  );
}
