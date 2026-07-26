'use client';

// MakeOfferModal — bottom-sheet for building a trade offer against a trade
// listing: pick up to 5 owned cards + optional coins, submit via makeOffer().
// Same modal shell as SlotPicker in squad-builder.tsx.

import { useEffect, useMemo, useState } from 'react';
import type { OwnedCard } from '@/lib/utcg/server';
import { CardTile } from '@/components/utcg/card-tile';
import { CoinGlyph } from '@/components/utcg/coin-glyph';
import { makeOffer, type Listing } from '@/lib/utcg/market';

const MAX_CARDS = 5;

function ownedKey(o: OwnedCard): string {
  return `${o.card.playerId}|${o.card.teamSlug}|${o.card.year}`;
}

interface MakeOfferModalProps {
  listing: Listing;
  owned: OwnedCard[];
  coins: number;
  onClose: () => void;
  onOffered: () => void;
}

export function MakeOfferModal({ listing, owned, coins, onClose, onOffered }: MakeOfferModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [coinInput, setCoinInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const eligible = useMemo(() => owned.filter((o) => o.copies > 0), [owned]);

  const offeredCoins = coinInput.trim() === '' ? 0 : Math.max(0, Math.floor(Number(coinInput)) || 0);
  const coinsExceedBalance = offeredCoins > coins;
  const atMaxCards = selected.size >= MAX_CARDS;
  const canSubmit = (selected.size > 0 || offeredCoins > 0) && !coinsExceedBalance;

  function toggleCard(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAX_CARDS) return prev;
        next.add(key);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (submitting || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const cards = eligible
        .filter((o) => selected.has(ownedKey(o)))
        .map((o) => ({
          ref: { playerId: o.card.playerId, teamSlug: o.card.teamSlug, year: o.card.year },
          qty: 1,
        }));
      await makeOffer(listing.id, cards, offeredCoins);
      onOffered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that offer — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-ink/40 motion-safe:animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Make an offer for ${listing.card.name}`}
        className="relative z-10 w-full sm:max-w-lg bg-bg rounded-t-card-lg sm:rounded-card-lg shadow-hero max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center gap-3 p-4 border-b border-hairline flex-shrink-0">
          <div className="w-14 flex-shrink-0">
            <CardTile card={listing.card} compact />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-accent font-tight mb-0.5">
              Make an Offer
            </p>
            <h3 className="font-display italic text-lg font-bold text-ink leading-none truncate">
              For {listing.card.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center text-faint hover:text-ink hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:transition-colors motion-safe:duration-150 cursor-pointer flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 2l10 10M12 2l-10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted font-tight">
                Your cards
              </p>
              <p className="text-[11px] text-faint font-tight">
                {selected.size}/{MAX_CARDS} selected
              </p>
            </div>
            {eligible.length === 0 ? (
              <p className="text-[13px] text-muted font-tight text-center py-6">
                You don&apos;t have any cards to offer.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {eligible.map((o) => {
                  const key = ownedKey(o);
                  const isSelected = selected.has(key);
                  return (
                    <CardTile
                      key={key}
                      card={o.card}
                      copies={o.copies}
                      compact
                      selected={isSelected}
                      disabled={!isSelected && atMaxCards}
                      onClick={() => toggleCard(key)}
                    />
                  );
                })}
              </div>
            )}
            {atMaxCards && (
              <p className="text-[11px] text-faint font-tight mt-2">Up to {MAX_CARDS} cards.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="offer-coins" className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted font-tight">
              Add coins (optional)
            </label>
            <div className="relative">
              <input
                id="offer-coins"
                type="number"
                inputMode="numeric"
                min={0}
                max={coins}
                step={1}
                value={coinInput}
                onChange={(e) => setCoinInput(e.target.value)}
                placeholder="0"
                className="w-full pl-4 pr-11 py-3 rounded-full bg-ink/5 text-[13px] font-tight text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[44px]"
              />
              <CoinGlyph size={15} className="text-accent absolute right-4 top-1/2 -translate-y-1/2" />
            </div>
            <p className="text-[11px] text-faint font-tight">
              You have {coins.toLocaleString()} coins.
            </p>
            {coinsExceedBalance && (
              <p className="text-[11px] text-live font-tight" role="alert">
                You only have {coins.toLocaleString()} coins.
              </p>
            )}
          </div>

          {/* Live summary */}
          <div className="rounded-card bg-ink/5 p-4">
            <p className="text-[12px] text-muted font-tight">
              Offering:{' '}
              <span className="text-ink font-bold">
                {selected.size} card{selected.size === 1 ? '' : 's'}
                {offeredCoins > 0 ? ` + ${offeredCoins.toLocaleString()} coins` : ''}
              </span>{' '}
              for <span className="text-ink font-bold">{listing.card.name}</span>
            </p>
          </div>

          {!canSubmit && !coinsExceedBalance && (
            <p className="text-[11px] text-faint font-tight">
              Select at least one card or add coins to make an offer.
            </p>
          )}

          {error && (
            <p className="text-[12px] text-live font-tight" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-hairline flex-shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={[
              'w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full',
              'text-[13px] font-bold tracking-[0.14em] uppercase font-tight',
              'bg-accent text-accent-ink hover:opacity-90 transition-opacity duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'min-h-[52px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {submitting ? (
              <>
                <Spinner />
                Sending…
              </>
            ) : (
              'Send Offer'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
      <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
