'use client';

// JerseyBrowse — the board. Tabs (Listings / Wanted), a search box, and filters
// collapsed behind ONE badged button, matching the UTCG Marketplace idiom (a
// visible filter row wraps to 3 lines on a phone and pushes content below the
// fold).
//
// Filtering is CLIENT-side over a server-fetched page. The board is small for
// now, and this keeps every control instant with no round trip. Revisit if the
// listing count outgrows one page.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PillSelect, type PillSelectOption } from '@/components/pill-select';
import { AuthModal } from '@/components/auth/auth-modal';
import { JerseyCard } from '@/components/jerseys/jersey-card';
import { WantCard } from '@/components/jerseys/want-card';
import { jerseyTargetLine, type JerseyListing, type JerseyWant } from '@/lib/jerseys/types';

const POST_CTA_CLASS =
  'inline-flex items-center gap-1.5 px-4 min-h-[38px] rounded-full bg-accent text-accent-ink ' +
  'text-[11.5px] font-bold tracking-[0.06em] uppercase font-tight hover:opacity-90 cursor-pointer ' +
  'motion-safe:transition-opacity focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

type Tab = 'listings' | 'wants';
type SortMode = 'newest' | 'price-low' | 'price-high';

const SORT_OPTIONS: PillSelectOption<SortMode>[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'price-low', label: 'Price: low to high' },
  { value: 'price-high', label: 'Price: high to low' },
];

export function JerseyBrowse({
  listings,
  wants,
  signedIn,
}: {
  listings: JerseyListing[];
  wants: JerseyWant[];
  signedIn: boolean;
}) {
  const [tab, setTab] = useState<Tab>('listings');
  const [q, setQ] = useState('');
  const [size, setSize] = useState<string>('all');
  const [place, setPlace] = useState<string>('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  // Options are derived from what's actually on the board, so we never offer a
  // filter that would return nothing.
  const sizeOptions = useMemo<PillSelectOption<string>[]>(() => {
    const set = new Set(listings.map((l) => l.size).filter((s): s is string => !!s));
    return [
      { value: 'all', label: 'Any size' },
      ...[...set].sort().map((s) => ({ value: s, label: s })),
    ];
  }, [listings]);

  const placeOptions = useMemo<PillSelectOption<string>[]>(() => {
    const set = new Set<string>();
    for (const l of [...listings, ...wants]) {
      const p = l.country || l.state;
      if (p) set.add(p);
    }
    return [
      { value: 'all', label: 'Anywhere' },
      ...[...set].sort().map((s) => ({ value: s, label: s })),
    ];
  }, [listings, wants]);

  const activeFilterCount = (size !== 'all' ? 1 : 0) + (place !== 'all' ? 1 : 0);

  function resetFilters() {
    setSize('all');
    setPlace('all');
    setSort('newest');
  }

  const visibleListings = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = listings.filter((l) => {
      if (size !== 'all' && l.size !== size) return false;
      if (place !== 'all' && l.country !== place && l.state !== place) return false;
      if (needle) {
        const hay = [l.title, l.teamName, l.playerName, l.leagueName, l.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    if (sort !== 'newest') {
      // Listings without a price sort last either way — an absent price isn't 0.
      out = [...out].sort((a, b) => {
        const ap = a.priceCents;
        const bp = b.priceCents;
        if (ap == null && bp == null) return 0;
        if (ap == null) return 1;
        if (bp == null) return -1;
        return sort === 'price-low' ? ap - bp : bp - ap;
      });
    }
    return out;
  }, [listings, q, size, place, sort]);

  const visibleWants = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return wants.filter((w) => {
      if (place !== 'all' && w.country !== place && w.state !== place) return false;
      if (needle) {
        const hay = [jerseyTargetLine(w), w.leagueName, w.note].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [wants, q, place]);

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs + post CTA */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TabPill active={tab === 'listings'} onClick={() => setTab('listings')}>
            Listings
            <Count>{listings.length}</Count>
          </TabPill>
          <TabPill active={tab === 'wants'} onClick={() => setTab('wants')}>
            Wanted
            <Count>{wants.length}</Count>
          </TabPill>
        </div>

        {/* Signed-out users get the auth modal rather than a trip to
            /jerseys/new, which server-redirects them straight back here. */}
        {signedIn ? (
          <Link
            href={tab === 'wants' ? '/jerseys/wanted/new' : '/jerseys/new'}
            className={POST_CTA_CLASS}
          >
            <PlusGlyph />
            {tab === 'wants' ? 'Post a want' : 'List a jersey'}
          </Link>
        ) : (
          <button type="button" onClick={() => setAuthOpen(true)} className={POST_CTA_CLASS}>
            <PlusGlyph />
            {tab === 'wants' ? 'Post a want' : 'List a jersey'}
          </button>
        )}
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="relative flex-1 min-w-[180px]">
          <span className="sr-only">Search jerseys</span>
          <SearchGlyph />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Team, player, league…"
            className="w-full pl-9 pr-3 min-h-[38px] rounded-full bg-surface shadow-card text-[13px] text-ink font-tight placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>

        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="jersey-filters"
          className={[
            'inline-flex items-center gap-2 px-3.5 min-h-[38px] rounded-full',
            'text-[11px] font-bold tracking-[0.06em] uppercase font-tight',
            'motion-safe:transition-colors motion-safe:duration-150 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            activeFilterCount > 0 || filtersOpen
              ? 'bg-ink text-bg'
              : 'bg-ink/5 text-muted hover:bg-ink/10 hover:text-ink',
          ].join(' ')}
        >
          <FilterGlyph />
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-accent-ink text-[9px] font-extrabold tabular">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-[11px] font-semibold text-faint hover:text-ink font-tight cursor-pointer px-2 py-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Clear
          </button>
        )}
      </div>

      {filtersOpen && (
        <div
          id="jersey-filters"
          className="flex flex-col gap-3 p-3.5 rounded-card bg-surface shadow-card motion-safe:animate-fade-in"
        >
          {tab === 'listings' && (
            <>
              <FilterRow label="Size">
                <PillSelect value={size} options={sizeOptions} onChange={setSize} ariaLabel="Filter by size" />
              </FilterRow>
              <FilterRow label="Sort">
                <PillSelect value={sort} options={SORT_OPTIONS} onChange={setSort} ariaLabel="Sort listings" />
              </FilterRow>
            </>
          )}
          <FilterRow label="Location">
            <PillSelect value={place} options={placeOptions} onChange={setPlace} ariaLabel="Filter by location" />
          </FilterRow>
        </div>
      )}

      {!signedIn && (
        <p className="text-[12px] text-muted font-tight rounded-card bg-surface shadow-card px-4 py-3">
          Browsing as a guest.{' '}
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="font-bold text-accent underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Sign in
          </button>{' '}
          to post a jersey or message someone.
        </p>
      )}

      <AuthModal
        open={authOpen}
        dismissible
        initialMode="signin"
        onDismiss={() => setAuthOpen(false)}
      />

      {/* Results */}
      {tab === 'listings' ? (
        visibleListings.length === 0 ? (
          <EmptyState
            title={listings.length === 0 ? 'No jerseys listed yet' : 'Nothing matches those filters'}
            body={
              listings.length === 0
                ? 'Be the first — list a jersey you’d trade or sell.'
                : 'Try clearing a filter or searching for something else.'
            }
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleListings.map((l) => (
              <JerseyCard key={l.id} listing={l} />
            ))}
          </div>
        )
      ) : visibleWants.length === 0 ? (
        <EmptyState
          title={wants.length === 0 ? 'Nobody’s posted a want yet' : 'Nothing matches those filters'}
          body={
            wants.length === 0
              ? 'Post the jersey you’re hunting for and let people come to you.'
              : 'Try clearing a filter.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleWants.map((w) => (
            <WantCard key={w.id} want={w} />
          ))}
        </div>
      )}
    </div>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'inline-flex items-center gap-1.5 px-3.5 min-h-[36px] rounded-full',
        'text-[11px] font-bold tracking-[0.06em] uppercase font-tight cursor-pointer',
        'motion-safe:transition-colors motion-safe:duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active ? 'bg-ink text-bg' : 'bg-ink/5 text-muted hover:bg-ink/10 hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-extrabold tabular opacity-60">{children}</span>;
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-muted font-tight flex-shrink-0">
        {label}
      </span>
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card-lg bg-surface shadow-card px-6 py-12 text-center flex flex-col items-center gap-2">
      <span className="font-display italic text-2xl font-bold text-ink">{title}</span>
      <span className="text-[13px] text-muted font-tight max-w-[340px]">{body}</span>
    </div>
  );
}

function PlusGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FilterGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M1.5 3h11M3.5 7h7M5.5 11h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
    >
      <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.2 9.2 12.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
