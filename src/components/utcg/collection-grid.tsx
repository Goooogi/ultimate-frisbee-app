'use client';

// CollectionGrid — COLLECTION tab. Responsive grid of owned cards
// (best-first, as provided) with position/tier filters and a name search.

import { useMemo, useState } from 'react';
import type { OwnedCard } from '@/lib/utcg/server';
import type { UtcgCard } from '@/lib/utcg/data';
import type { UtcgPosition } from '@/lib/utcg/position';
import type { CardTier } from '@/lib/utcg/packs';
import { TIERS } from '@/lib/utcg/packs';
import { CardTile, tierDotStyle } from '@/components/utcg/card-tile';
import { PillSelect, type PillSelectOption } from '@/components/pill-select';

// Tier filter as a dropdown (7 tiers + All would be too many pills — the app
// uses PillSelect for any multi-option filter; see USAU/PUL/year selectors).
const TIER_OPTIONS: PillSelectOption<CardTier | 'all'>[] = [
  { value: 'all', label: 'All Tiers' },
  ...TIERS.map((t) => ({ value: t.key, label: t.label })),
];

type PositionFilter = 'all' | UtcgPosition;

const POSITION_FILTERS: { key: PositionFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'handler', label: 'Handler' },
  { key: 'cutter', label: 'Cutter' },
  { key: 'hybrid', label: 'Hybrid' },
];

interface CollectionGridProps {
  owned: OwnedCard[];
  /** When provided, tapping a card opens the list-on-market modal for it
   *  (wired by UtcgGame -> ListCardModal). Omitted keeps cards non-interactive,
   *  exactly matching prior behavior. */
  onListCard?: (card: UtcgCard) => void;
}

export function CollectionGrid({ owned, onListCard }: CollectionGridProps) {
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [tierFilter, setTierFilter] = useState<CardTier | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return owned.filter((o) => {
      if (positionFilter !== 'all' && o.card.position !== positionFilter) return false;
      if (tierFilter !== 'all' && o.card.tier !== tierFilter) return false;
      if (q && !o.card.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [owned, positionFilter, tierFilter, search]);

  // Tier breakdown — counts derived purely from what the user actually owns
  // (no fabricated "X / 7,905 total pool" fraction; that number isn't
  // available client-side). Only tiers with at least 1 owned card show a chip.
  const tierCounts = useMemo(() => {
    const counts = new Map<CardTier, number>();
    for (const o of owned) counts.set(o.card.tier, (counts.get(o.card.tier) ?? 0) + 1);
    return TIERS.map((t) => ({ tier: t.key, label: t.label, count: counts.get(t.key) ?? 0 })).filter(
      (t) => t.count > 0,
    );
  }, [owned]);

  if (owned.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-full bg-ink/5 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-faint">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </div>
        <p className="font-display italic text-xl font-bold text-ink">No cards yet</p>
        <p className="text-[13px] text-muted font-tight max-w-[280px]">
          Open a pack to start your collection.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <p className="text-[12px] text-muted font-tight">
          {owned.length.toLocaleString()} card{owned.length === 1 ? '' : 's'} in your collection
        </p>
        {tierCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {tierCounts.map(({ tier, label, count }) => (
              <span
                key={tier}
                className="inline-flex items-center gap-1.5 text-[9.5px] font-bold tracking-[0.04em] uppercase px-2 py-1 rounded-full leading-none bg-ink/5 text-ink/70"
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={tierDotStyle(tier)} aria-hidden="true" />
                {label}
                <span className="tabular opacity-70">{count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name…"
        aria-label="Search your collection by player name"
        className="w-full px-4 py-3 rounded-full bg-ink/5 text-[13px] font-tight text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[44px]"
      />

      {/* Filters — position as quick pills (only 4), tier as a dropdown (7). */}
      <div className="flex flex-wrap items-center gap-2">
        {POSITION_FILTERS.map((f) => (
          <FilterPill
            key={f.key}
            active={positionFilter === f.key}
            onClick={() => setPositionFilter(f.key)}
            label={f.label}
          />
        ))}
        <PillSelect
          value={tierFilter}
          options={TIER_OPTIONS}
          onChange={setTierFilter}
          ariaLabel="Filter by tier"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-[13px] text-muted font-tight text-center py-12">
          No cards match your filters.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((o) => (
            <CardTile
              key={`${o.card.playerId}|${o.card.teamSlug}|${o.card.year}`}
              card={o.card}
              copies={o.copies}
              onClick={onListCard ? () => onListCard(o.card) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex items-center justify-center px-3.5 py-2 rounded-full',
        'text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
        'motion-safe:transition-colors motion-safe:duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'min-h-[36px] cursor-pointer',
        active ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:bg-ink/10',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
