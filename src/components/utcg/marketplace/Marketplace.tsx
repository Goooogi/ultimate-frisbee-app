'use client';

// Marketplace — MARKET tab. Browse active listings (buy/make offer) and
// manage your own market activity (Selling / Offers Received / Offers Made)
// under a "My Market" sub-tab. Mirrors CollectionGrid's filter-row idioms
// (FilterPill for small option sets, PillSelect for tier) and the app's
// bottom-sheet modal idiom for ListCardModal/MakeOfferModal.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OwnedCard } from '@/lib/utcg/server';
import type { CardTier } from '@/lib/utcg/packs';
import { TIERS } from '@/lib/utcg/packs';
import { CardTile, tierDotStyle } from '@/components/utcg/card-tile';
import { CoinGlyph } from '@/components/utcg/coin-glyph';
import { PillSelect, type PillSelectOption } from '@/components/pill-select';
import { MakeOfferModal } from '@/components/utcg/marketplace/MakeOfferModal';
import {
  getActiveListings,
  getMyListings,
  getOffersForListings,
  getMyOffers,
  buyListing,
  cancelListing,
  acceptOffer,
  declineOffer,
  withdrawOffer,
  type Listing,
  type TradeOffer,
} from '@/lib/utcg/market';

const TIER_OPTIONS: PillSelectOption<CardTier | 'all'>[] = [
  { value: 'all', label: 'All Tiers' },
  ...TIERS.map((t) => ({ value: t.key, label: t.label })),
];

type KindFilter = 'all' | 'sell' | 'trade';
const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sell', label: 'Sell' },
  { key: 'trade', label: 'Trade' },
];

type SortMode = 'newest' | 'price';
const SORT_OPTIONS: PillSelectOption<SortMode>[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price', label: 'Price: Low to High' },
];

type SubTab = 'browse' | 'my-market';

interface MarketplaceProps {
  owned: OwnedCard[];
  coins: number;
  userId: string | null;
  onCoinsChange: (n: number) => void;
  onMutated: () => void;
}

export function Marketplace({ owned, coins, userId, onCoinsChange, onMutated }: MarketplaceProps) {
  const [subTab, setSubTab] = useState<SubTab>('browse');

  // Shared listings state — Browse fetches every active listing; My Market's
  // "Offers Made" cross-references this same map to show the target card, so
  // it's kept at this top level rather than duplicated per-tab.
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setListingsLoading(true);
    setListingsError(null);
    getActiveListings()
      .then((rows) => {
        if (cancelled) return;
        setListings(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setListingsError(err instanceof Error ? err.message : 'Could not load the market — try again.');
      })
      .finally(() => {
        if (cancelled) return;
        setListingsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const listingById = useMemo(() => {
    const map = new Map<string, Listing>();
    for (const l of listings ?? []) map.set(l.id, l);
    return map;
  }, [listings]);

  const afterMutation = useCallback(() => {
    bump();
    onMutated();
  }, [bump, onMutated]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <FilterPill active={subTab === 'browse'} onClick={() => setSubTab('browse')} label="Browse" />
        <FilterPill active={subTab === 'my-market'} onClick={() => setSubTab('my-market')} label="My Market" />
      </div>

      {subTab === 'browse' ? (
        <BrowseTab
          listings={listings}
          loading={listingsLoading}
          error={listingsError}
          onRetry={bump}
          coins={coins}
          userId={userId}
          owned={owned}
          onCoinsChange={onCoinsChange}
          onMutated={afterMutation}
        />
      ) : (
        <MyMarketTab
          userId={userId}
          listingById={listingById}
          onMutated={afterMutation}
        />
      )}
    </div>
  );
}

// ─── Browse tab ─────────────────────────────────────────────────────────────

function BrowseTab({
  listings,
  loading,
  error,
  onRetry,
  coins,
  userId,
  owned,
  onCoinsChange,
  onMutated,
}: {
  listings: Listing[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  coins: number;
  userId: string | null;
  owned: OwnedCard[];
  onCoinsChange: (n: number) => void;
  onMutated: () => void;
}) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [tierFilter, setTierFilter] = useState<CardTier | 'all'>('all');
  const [sort, setSort] = useState<SortMode>('newest');

  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [buyErrors, setBuyErrors] = useState<Map<string, string>>(new Map());
  const [offeringListing, setOfferingListing] = useState<Listing | null>(null);

  const filtered = useMemo(() => {
    if (!listings) return [];
    let rows = listings.filter((l) => {
      if (kindFilter !== 'all' && l.kind !== kindFilter) return false;
      if (tierFilter !== 'all' && l.card.tier !== tierFilter) return false;
      return true;
    });
    if (sort === 'price') {
      rows = [...rows].sort((a, b) => {
        const ap = a.askPrice ?? Number.POSITIVE_INFINITY;
        const bp = b.askPrice ?? Number.POSITIVE_INFINITY;
        return ap - bp;
      });
    }
    return rows;
  }, [listings, kindFilter, tierFilter, sort]);

  async function handleBuy(listing: Listing) {
    setBuyingId(listing.id);
    setBuyErrors((prev) => {
      const next = new Map(prev);
      next.delete(listing.id);
      return next;
    });
    try {
      const newBalance = await buyListing(listing.id);
      onCoinsChange(newBalance);
      onMutated();
    } catch (err) {
      setBuyErrors((prev) => {
        const next = new Map(prev);
        next.set(listing.id, err instanceof Error ? err.message : 'Could not buy this card — try again.');
        return next;
      });
    } finally {
      setBuyingId(null);
    }
  }

  if (loading) return <ListingsSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 px-4 text-center">
        <p className="text-[13px] text-live font-tight" role="alert">
          {error}
        </p>
        <RetryButton onClick={onRetry} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((f) => (
          <FilterPill key={f.key} active={kindFilter === f.key} onClick={() => setKindFilter(f.key)} label={f.label} />
        ))}
        <PillSelect value={tierFilter} options={TIER_OPTIONS} onChange={setTierFilter} ariaLabel="Filter by tier" />
        <PillSelect value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Sort listings" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={listings && listings.length > 0 ? 'No listings match your filters.' : 'No listings yet'}
          subtitle={listings && listings.length > 0 ? undefined : 'Be the first to sell!'}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map((listing) => (
            <ListingTile
              key={listing.id}
              listing={listing}
              userId={userId}
              coins={coins}
              buying={buyingId === listing.id}
              buyError={buyErrors.get(listing.id) ?? null}
              onBuy={() => handleBuy(listing)}
              onMakeOffer={() => setOfferingListing(listing)}
            />
          ))}
        </div>
      )}

      {offeringListing && (
        <MakeOfferModal
          listing={offeringListing}
          owned={owned}
          coins={coins}
          onClose={() => setOfferingListing(null)}
          onOffered={() => {
            setOfferingListing(null);
            onMutated();
          }}
        />
      )}
    </div>
  );
}

function ListingTile({
  listing,
  userId,
  coins,
  buying,
  buyError,
  onBuy,
  onMakeOffer,
}: {
  listing: Listing;
  userId: string | null;
  coins: number;
  buying: boolean;
  buyError: string | null;
  onBuy: () => void;
  onMakeOffer: () => void;
}) {
  const isMine = listing.sellerId === userId;
  const canAffordSell = listing.kind !== 'sell' || listing.askPrice === null || coins >= listing.askPrice;

  return (
    <div className="flex flex-col gap-2">
      <CardTile card={listing.card} />
      <div className="flex flex-col gap-1.5">
        {isMine && (
          <span className="self-start bg-ink/5 text-ink/70 text-[9.5px] font-bold uppercase tracking-[0.06em] px-2 py-1 rounded-full leading-none">
            Yours
          </span>
        )}
        {listing.kind === 'sell' ? (
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1">
              <CoinGlyph size={13} className="text-accent" />
              <span className="font-display font-bold text-[13px] text-ink tabular leading-none">
                {(listing.askPrice ?? 0).toLocaleString()}
              </span>
            </span>
            <button
              type="button"
              onClick={onBuy}
              disabled={isMine || buying || !canAffordSell}
              className={[
                'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full',
                'text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
                'bg-accent text-accent-ink hover:opacity-90 transition-opacity duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'min-h-[36px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {buying ? <Spinner /> : 'Buy'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onMakeOffer}
            disabled={isMine}
            className={[
              'inline-flex items-center justify-center px-3 py-2 rounded-full w-full',
              'text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
              'bg-accent text-accent-ink hover:opacity-90 transition-opacity duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'min-h-[36px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            Make Offer
          </button>
        )}
        {!isMine && listing.kind === 'sell' && !canAffordSell && (
          <p className="text-[10px] text-live font-tight">Not enough coins.</p>
        )}
        {buyError && (
          <p className="text-[10px] text-live font-tight" role="alert">
            {buyError}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── My Market tab ──────────────────────────────────────────────────────────

function MyMarketTab({
  userId,
  listingById,
  onMutated,
}: {
  userId: string | null;
  listingById: Map<string, Listing>;
  onMutated: () => void;
}) {
  const [myListings, setMyListings] = useState<Listing[] | null>(null);
  const [myOffers, setMyOffers] = useState<TradeOffer[] | null>(null);
  const [offersByListing, setOffersByListing] = useState<Map<string, TradeOffer[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const bump = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [mine, mine2] = await Promise.all([getMyListings(userId), getMyOffers(userId)]);
        if (cancelled) return;
        setMyListings(mine);
        setMyOffers(mine2);
        const activeIds = mine.filter((l) => l.status === 'active').map((l) => l.id);
        const offersMap = await getOffersForListings(activeIds);
        if (cancelled) return;
        setOffersByListing(offersMap);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load your market activity — try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  const afterMutation = useCallback(() => {
    bump();
    onMutated();
  }, [bump, onMutated]);

  if (!userId) return null;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner large />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 px-4 text-center">
        <p className="text-[13px] text-live font-tight" role="alert">
          {error}
        </p>
        <RetryButton onClick={bump} />
      </div>
    );
  }

  const activeListings = (myListings ?? []).filter((l) => l.status === 'active');
  const allPendingOffersReceived = Array.from(offersByListing.values())
    .flat()
    .filter((o) => o.status === 'pending');
  const pendingOffersMade = (myOffers ?? []).filter((o) => o.status === 'pending');

  return (
    <div className="flex flex-col gap-8">
      <MarketSection title="Selling">
        {activeListings.length === 0 ? (
          <SectionEmpty text="You're not selling anything." />
        ) : (
          <div className="flex flex-col gap-3">
            {activeListings.map((listing) => (
              <SellingRow
                key={listing.id}
                listing={listing}
                offers={(offersByListing.get(listing.id) ?? []).filter((o) => o.status === 'pending')}
                onMutated={afterMutation}
              />
            ))}
          </div>
        )}
      </MarketSection>

      <MarketSection title="Offers Received">
        {allPendingOffersReceived.length === 0 ? (
          <SectionEmpty text="No offers on your listings." />
        ) : (
          <div className="flex flex-col gap-3">
            {allPendingOffersReceived.map((offer) => (
              <OfferReceivedRow
                key={offer.id}
                offer={offer}
                listing={listingById.get(offer.listingId) ?? (myListings ?? []).find((l) => l.id === offer.listingId) ?? null}
                onMutated={afterMutation}
              />
            ))}
          </div>
        )}
      </MarketSection>

      <MarketSection title="Offers Made">
        {pendingOffersMade.length === 0 ? (
          <SectionEmpty text="You haven't made any offers." />
        ) : (
          <div className="flex flex-col gap-3">
            {pendingOffersMade.map((offer) => (
              <OfferMadeRow
                key={offer.id}
                offer={offer}
                listing={listingById.get(offer.listingId) ?? null}
                onMutated={afterMutation}
              />
            ))}
          </div>
        )}
      </MarketSection>
    </div>
  );
}

function MarketSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-bold tracking-[0.14em] uppercase text-muted font-tight">{title}</p>
      {children}
    </div>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return <p className="text-[13px] text-muted font-tight">{text}</p>;
}

function SellingRow({
  listing,
  offers,
  onMutated,
}: {
  listing: Listing;
  offers: TradeOffer[];
  onMutated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      await cancelListing(listing.id);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel this listing — try again.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="rounded-card bg-surface shadow-card p-3 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-14 flex-shrink-0">
          <CardTile card={listing.card} compact />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display italic text-[15px] font-bold text-ink leading-none truncate">
            {listing.card.name}
          </p>
          <p className="text-[11px] text-faint font-tight mt-1">
            {listing.kind === 'sell' ? (
              <span className="inline-flex items-center gap-1">
                <CoinGlyph size={11} className="text-accent" />
                {(listing.askPrice ?? 0).toLocaleString()}
              </span>
            ) : (
              'Listed for trade'
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className={[
              'inline-flex items-center justify-center px-3 py-2 rounded-full',
              'text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
              'bg-ink/5 text-muted hover:bg-ink/10 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'min-h-[36px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {cancelling ? <Spinner /> : 'Cancel'}
          </button>
          {listing.kind === 'trade' && offers.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="text-[10.5px] font-bold text-accent underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              {offers.length} offer{offers.length === 1 ? '' : 's'} {expanded ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="text-[11px] text-live font-tight" role="alert">
          {error}
        </p>
      )}
      {expanded && offers.length > 0 && (
        <div className="flex flex-col gap-3 pt-1 border-t border-hairline">
          {offers.map((offer) => (
            <OfferReceivedRow key={offer.id} offer={offer} listing={listing} onMutated={onMutated} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferReceivedRow({
  offer,
  listing,
  onMutated,
  compact = false,
}: {
  offer: TradeOffer;
  listing: Listing | null;
  onMutated: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setBusy('accept');
    setError(null);
    try {
      await acceptOffer(offer.id);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept this offer — try again.');
    } finally {
      setBusy(null);
    }
  }

  async function handleDecline() {
    setBusy('decline');
    setError(null);
    try {
      await declineOffer(offer.id);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not decline this offer — try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={compact ? 'flex flex-col gap-2' : 'rounded-card bg-surface shadow-card p-3 flex flex-col gap-2.5'}>
      {!compact && listing && (
        <div className="flex items-center gap-2">
          <div className="w-10 flex-shrink-0">
            <CardTile card={listing.card} compact />
          </div>
          <p className="text-[11px] text-faint font-tight truncate">Offer for {listing.card.name}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {offer.cards.map((c, i) =>
          c.card ? (
            <div key={i} className="w-12 flex-shrink-0">
              <CardTile card={c.card} compact />
            </div>
          ) : null,
        )}
        {offer.offerCoins > 0 && (
          <span className="inline-flex items-center gap-1 bg-ink/5 rounded-full px-2.5 py-1.5">
            <CoinGlyph size={12} className="text-accent" />
            <span className="font-display font-bold text-[12px] text-ink tabular leading-none">
              {offer.offerCoins.toLocaleString()}
            </span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAccept}
          disabled={busy !== null}
          className={[
            'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full flex-1',
            'text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
            'bg-accent text-accent-ink hover:opacity-90 transition-opacity duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'min-h-[36px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {busy === 'accept' ? <Spinner /> : 'Accept'}
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={busy !== null}
          className={[
            'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full flex-1',
            'text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
            'bg-ink/5 text-muted hover:bg-ink/10 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'min-h-[36px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
          ].join(' ')}
        >
          {busy === 'decline' ? <Spinner /> : 'Decline'}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-live font-tight" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function OfferMadeRow({
  offer,
  listing,
  onMutated,
}: {
  offer: TradeOffer;
  listing: Listing | null;
  onMutated: () => void;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw() {
    setWithdrawing(true);
    setError(null);
    try {
      await withdrawOffer(offer.id);
      onMutated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not withdraw this offer — try again.');
    } finally {
      setWithdrawing(false);
    }
  }

  return (
    <div className="rounded-card bg-surface shadow-card p-3 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {listing ? (
          <>
            <div className="w-10 flex-shrink-0">
              <CardTile card={listing.card} compact />
            </div>
            <p className="text-[11px] text-faint font-tight truncate">For {listing.card.name}</p>
          </>
        ) : (
          <p className="text-[11px] text-faint font-tight">Listing no longer available</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {offer.cards.map((c, i) =>
          c.card ? (
            <div key={i} className="w-12 flex-shrink-0">
              <CardTile card={c.card} compact />
            </div>
          ) : null,
        )}
        {offer.offerCoins > 0 && (
          <span className="inline-flex items-center gap-1 bg-ink/5 rounded-full px-2.5 py-1.5">
            <CoinGlyph size={12} className="text-accent" />
            <span className="font-display font-bold text-[12px] text-ink tabular leading-none">
              {offer.offerCoins.toLocaleString()}
            </span>
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={handleWithdraw}
        disabled={withdrawing}
        className={[
          'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full',
          'text-[10.5px] font-bold tracking-[0.06em] uppercase font-tight',
          'bg-ink/5 text-muted hover:bg-ink/10 transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          'min-h-[36px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        {withdrawing ? <Spinner /> : 'Withdraw'}
      </button>
      {error && (
        <p className="text-[11px] text-live font-tight" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

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

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-ink/5 flex items-center justify-center">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-faint">
          <path d="M4 8l1.5-4h13L20 8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M4 8h16v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9 12a3 3 0 0 0 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="font-display italic text-xl font-bold text-ink">{title}</p>
      {subtitle && <p className="text-[13px] text-muted font-tight max-w-[280px]">{subtitle}</p>}
    </div>
  );
}

function ListingsSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="rounded-card bg-ink/5 animate-pulse" style={{ aspectRatio: '3 / 4.6' }} />
      ))}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center justify-center px-5 py-2.5 rounded-full',
        'text-[11px] font-bold tracking-[0.08em] uppercase font-tight',
        'bg-ink/5 text-ink hover:bg-ink/10 transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'min-h-[40px] cursor-pointer',
      ].join(' ')}
    >
      Retry
    </button>
  );
}

function Spinner({ large = false }: { large?: boolean }) {
  const size = large ? 'w-6 h-6' : 'w-4 h-4';
  return (
    <svg className={`animate-spin ${size}`} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
      <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
