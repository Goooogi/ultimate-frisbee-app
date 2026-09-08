'use client';

// NominateSheet — opening-bid stepper modal, clamped to [max(minBid, price),
// maxBid]. Ported from mobile AuctionRoom.tsx's NominateSheet by intent.

import { useEffect, useState } from 'react';
import type { FantasyPlayerHit } from '@/lib/fantasy/data';

export function NominateSheet({
  hit,
  minBid,
  maxBid,
  openingPrice,
  onCancel,
  onConfirm,
}: {
  hit: FantasyPlayerHit;
  minBid: number;
  maxBid: number;
  openingPrice: number | null;
  onCancel: () => void;
  onConfirm: (opening: number) => Promise<void>;
}) {
  const floor = Math.max(minBid, openingPrice ?? minBid);
  const ceiling = Math.max(maxBid, floor);
  const [amount, setAmount] = useState(Math.min(Math.max(floor, minBid), ceiling));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAmount(Math.min(Math.max(floor, minBid), ceiling));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor, minBid, ceiling]);

  const clamp = (v: number) => Math.min(Math.max(v, floor), ceiling);

  const submit = async () => {
    setSubmitting(true);
    try {
      await onConfirm(clamp(amount));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Nominate ${hit.fullName}`}
      onClick={onCancel}
    >
      <div
        className="bg-surface rounded-card-lg shadow-card p-6 w-full max-w-sm text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-tight text-[16px] font-bold text-ink">Nominate {hit.fullName}</h3>
        {openingPrice != null && (
          <p className="font-tight text-[12px] text-muted mt-1">Suggested opening ${openingPrice}</p>
        )}

        <div className="flex items-center justify-center gap-5 mt-5">
          <button
            type="button"
            onClick={() => setAmount((v) => clamp(v - 1))}
            disabled={amount <= floor}
            aria-label="Decrease opening bid"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-ink/[0.05] text-ink font-tight text-[20px] font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            &minus;
          </button>
          <span className="font-display italic text-[30px] text-ink min-w-[90px] tabular">${amount}</span>
          <button
            type="button"
            onClick={() => setAmount((v) => clamp(v + 1))}
            disabled={amount >= ceiling}
            aria-label="Increase opening bid"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-ink/[0.05] text-ink font-tight text-[20px] font-bold disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-80 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            +
          </button>
        </div>
        <p className="font-tight text-[11px] text-faint mt-2">
          ${floor} &ndash; ${ceiling}
        </p>

        <div className="flex gap-2.5 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-full min-h-[44px] bg-ink/[0.06] text-ink font-tight text-[13px] font-bold hover:opacity-80 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center px-5 py-3 rounded-full min-h-[44px] bg-accent text-accent-ink font-tight text-[13px] font-bold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {submitting ? 'Nominating…' : 'Nominate'}
          </button>
        </div>
      </div>
    </div>
  );
}
