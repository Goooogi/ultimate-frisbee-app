'use client';

// JerseyCard — one listing in the browse grid. Photo-forward, because the
// photo IS the pitch for a physical item; everything else is supporting detail.

import Link from 'next/link';
import { PosterByline } from '@/components/jerseys/poster-byline';
import {
  jerseyLocationLine,
  jerseyTargetLine,
  formatPrice,
  type JerseyListing,
} from '@/lib/jerseys/types';

export function JerseyCard({ listing }: { listing: JerseyListing }) {
  const cover = listing.photos[0] ?? null;
  const target = jerseyTargetLine(listing);
  const where = jerseyLocationLine(listing);
  const price = formatPrice(listing.priceCents);
  const nextEvent = listing.events[0] ?? null;

  return (
    <Link
      href={`/jerseys/${listing.id}`}
      className={[
        'group flex flex-col rounded-card-lg bg-surface shadow-card hover:shadow-lift overflow-hidden',
        'motion-safe:transition-shadow motion-safe:duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      ].join(' ')}
    >
      <div className="relative aspect-[4/5] bg-ink/5 overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.publicUrl}
            alt={listing.title}
            loading="lazy"
            className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-faint" aria-hidden="true">
            <JerseyGlyph />
          </div>
        )}

        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          <KindPill kind={listing.kind} />
          {listing.photos.length > 1 && (
            <span className="inline-flex items-center px-2 py-[3px] rounded-full bg-ink/70 text-bg text-[9px] font-bold tabular">
              {listing.photos.length}
            </span>
          )}
        </div>

        {price && (
          <span className="absolute bottom-2 right-2 inline-flex items-center px-2.5 py-1 rounded-full bg-bg/90 text-ink text-[11.5px] font-extrabold tabular shadow-card">
            {price}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <span className="text-[13px] font-bold text-ink font-tight leading-snug line-clamp-2">
          {listing.title}
        </span>

        {target && (
          <span className="text-[11.5px] text-muted font-tight truncate">{target}</span>
        )}

        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          {listing.size && <MetaChip>{listing.size}</MetaChip>}
          {listing.leagueName && <MetaChip>{listing.leagueName}</MetaChip>}
        </div>

        {nextEvent && (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent font-tight truncate mt-0.5">
            <PinGlyph />
            {nextEvent.name}
          </span>
        )}

        <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-hairline/60">
          <PosterByline poster={listing.owner} size={20} />
          {where && (
            <span className="text-[10.5px] text-faint font-tight truncate flex-shrink-0 max-w-[45%] text-right">
              {where}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function KindPill({ kind }: { kind: JerseyListing['kind'] }) {
  const label = kind === 'sell' ? 'For sale' : kind === 'both' ? 'Trade / sell' : 'Trade';
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-[3px] rounded-full',
        'text-[9px] font-extrabold tracking-[0.08em] uppercase font-tight',
        kind === 'trade' ? 'bg-accent text-accent-ink' : 'bg-ink/70 text-bg',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-[2px] rounded-full bg-ink/5 text-muted text-[10px] font-semibold font-tight">
      {children}
    </span>
  );
}

function PinGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true" className="flex-shrink-0">
      <path d="M6 1a3.5 3.5 0 0 1 3.5 3.5C9.5 7 6 11 6 11S2.5 7 2.5 4.5A3.5 3.5 0 0 1 6 1Z" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="6" cy="4.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function JerseyGlyph() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M17 8 9 12l3 8 4-1.5V40h16V18.5l4 1.5 3-8-8-4-3 3h-8l-3-3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
