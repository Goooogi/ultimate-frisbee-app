'use client';

// JerseyDetail — one listing, full size. Photo gallery + everything known about
// the jersey + the contact action.
//
// The contact button is the whole point of the feature: it opens (or reuses) a
// listing-scoped thread. We do NOT reveal contact details — no email, no phone,
// no off-platform handle — so conversations stay reportable.

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PosterByline } from '@/components/jerseys/poster-byline';
import { ReportButton } from '@/components/jerseys/report-button';
import { BlockButton } from '@/components/jerseys/block-button';
import { AuthModal } from '@/components/auth/auth-modal';
import { openThread } from '@/lib/jerseys/messages';
import { setListingStatus, deleteListing } from '@/lib/jerseys/data';
import {
  jerseyLocationLine,
  formatPrice,
  JERSEY_CONDITIONS,
  type JerseyListing,
} from '@/lib/jerseys/types';

export function JerseyDetail({
  listing,
  viewerId,
  ownerBlocked = false,
}: {
  listing: JerseyListing;
  viewerId: string | null;
  /** True when the viewer has blocked this listing's owner. */
  ownerBlocked?: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const isOwner = viewerId != null && viewerId === listing.ownerId;
  const where = jerseyLocationLine(listing);
  const price = formatPrice(listing.priceCents);
  const conditionLabel = JERSEY_CONDITIONS.find((c) => c.value === listing.condition)?.label ?? null;

  const handleMessage = useCallback(async () => {
    if (!viewerId) {
      // Was router.push('/jerseys') — a no-op from the listing page. Open the
      // same auth modal the rest of the app uses.
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err, threadId } = await openThread({
      listingId: listing.id,
      ownerId: listing.ownerId,
    });
    setBusy(false);
    if (err || !threadId) {
      setError(err ?? 'Could not start that conversation.');
      return;
    }
    router.push(`/jerseys/messages/${threadId}`);
  }, [viewerId, listing.id, listing.ownerId, router]);

  const handleStatus = useCallback(
    async (status: 'completed' | 'withdrawn' | 'active') => {
      setBusy(true);
      const err = await setListingStatus(listing.id, status);
      setBusy(false);
      if (err) setError(err);
      else router.refresh();
    },
    [listing.id, router],
  );

  const handleDelete = useCallback(async () => {
    if (!confirm('Delete this listing? This cannot be undone.')) return;
    setBusy(true);
    const err = await deleteListing(listing.id);
    setBusy(false);
    if (err) setError(err);
    else router.push('/jerseys');
  }, [listing.id, router]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
      {/* Gallery */}
      <div className="lg:w-[52%] flex flex-col gap-2">
        <div className="relative aspect-[4/5] rounded-card-lg overflow-hidden bg-ink/5 shadow-card">
          {listing.photos.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.photos[active]?.publicUrl}
              alt={`${listing.title} — photo ${active + 1}`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-faint text-[13px] font-tight">
              No photos
            </div>
          )}
          {listing.status !== 'active' && (
            <span className="absolute top-3 left-3 inline-flex items-center px-3 py-1.5 rounded-full bg-ink text-bg text-[10px] font-extrabold tracking-[0.1em] uppercase font-tight">
              {listing.status === 'completed' ? 'Gone' : 'Withdrawn'}
            </span>
          )}
        </div>

        {listing.photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {listing.photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Photo ${i + 1}`}
                aria-current={i === active}
                className={[
                  'relative w-16 h-20 flex-shrink-0 rounded-card overflow-hidden cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  i === active ? 'ring-2 ring-accent' : 'opacity-70 hover:opacity-100',
                ].join(' ')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.publicUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="lg:flex-1 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-accent text-accent-ink text-[9.5px] font-extrabold tracking-[0.1em] uppercase font-tight">
              {listing.kind === 'sell' ? 'For sale' : listing.kind === 'both' ? 'Trade or sell' : 'For trade'}
            </span>
            {price && (
              <span className="text-[15px] font-extrabold text-ink tabular font-tight">{price}</span>
            )}
          </div>

          <h1 className="font-display italic text-3xl sm:text-4xl font-bold text-ink leading-[1.02] tracking-[-0.02em]">
            {listing.title}
          </h1>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          <Detail label="Team" value={listing.teamName} />
          <Detail label="Player" value={listing.playerName} />
          <Detail label="Year" value={listing.year ? String(listing.year) : null} />
          <Detail label="League" value={listing.leagueName} />
          <Detail label="Size" value={listing.size} />
          <Detail label="Condition" value={conditionLabel} />
          <Detail label="Location" value={where} />
        </dl>

        {listing.description && (
          <p className="text-[13.5px] text-muted font-tight leading-relaxed whitespace-pre-wrap">
            {listing.description}
          </p>
        )}

        {listing.events.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight">
              Will be at
            </span>
            <div className="flex flex-wrap gap-1.5">
              {listing.events.map((e) =>
                e.usauEventSlug ? (
                  <Link
                    key={e.id}
                    href={`/usau/events/${e.usauEventSlug}`}
                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-ink/5 text-ink text-[11px] font-semibold font-tight hover:bg-ink/10 motion-safe:transition-colors"
                  >
                    {e.name}
                  </Link>
                ) : (
                  <span
                    key={e.id}
                    className="inline-flex items-center px-2.5 py-1 rounded-full bg-ink/5 text-muted text-[11px] font-semibold font-tight"
                  >
                    {e.name}
                  </span>
                ),
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <PosterByline poster={listing.owner} size={32} subtitle={where} />
        </div>

        {error && (
          <p className="text-[12px] text-accent font-tight" role="alert">
            {error}
          </p>
        )}

        {/* Actions */}
        {isOwner ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/jerseys/${listing.id}/edit`}
              className="inline-flex items-center px-5 min-h-[44px] rounded-full bg-ink text-bg text-[12px] font-bold tracking-[0.06em] uppercase font-tight hover:opacity-90"
            >
              Edit
            </Link>
            {listing.status === 'active' ? (
              <>
                <SecondaryAction disabled={busy} onClick={() => handleStatus('completed')}>
                  Mark as gone
                </SecondaryAction>
                <SecondaryAction disabled={busy} onClick={() => handleStatus('withdrawn')}>
                  Withdraw
                </SecondaryAction>
              </>
            ) : (
              <SecondaryAction disabled={busy} onClick={() => handleStatus('active')}>
                Relist
              </SecondaryAction>
            )}
            <SecondaryAction disabled={busy} onClick={handleDelete}>
              Delete
            </SecondaryAction>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleMessage}
              disabled={busy || listing.status !== 'active'}
              className={[
                'inline-flex items-center gap-2 px-6 min-h-[48px] rounded-full',
                'text-[12.5px] font-bold tracking-[0.08em] uppercase font-tight',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                listing.status === 'active' && !busy
                  ? 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer'
                  : 'bg-surface text-faint cursor-not-allowed',
              ].join(' ')}
            >
              {busy ? 'Opening…' : viewerId ? 'Message owner' : 'Sign in to message'}
            </button>
            <ReportButton listingId={listing.id} reportedUserId={listing.ownerId} signedIn={Boolean(viewerId)} />
            <BlockButton
              userId={listing.ownerId}
              displayName={listing.owner?.displayName ?? null}
              initiallyBlocked={ownerBlocked}
              signedIn={Boolean(viewerId)}
            />
          </div>
        )}

        <AuthModal
          open={authOpen}
          dismissible
          initialMode="signin"
          onDismiss={() => setAuthOpen(false)}
        />

        {/* Safety note — these are strangers arranging to meet in person. */}
        {!isOwner && listing.status === 'active' && (
          <p className="text-[11.5px] text-faint font-tight leading-snug rounded-card bg-surface shadow-card px-3.5 py-3">
            The Layout doesn&rsquo;t handle payment or shipping — you arrange the swap directly. Meet
            somewhere public, ideally at a tournament you&rsquo;re both attending.
          </p>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[9.5px] font-bold tracking-[0.12em] uppercase text-faint font-tight">
        {label}
      </dt>
      <dd className="text-[13px] font-semibold text-ink font-tight">{value}</dd>
    </div>
  );
}

function SecondaryAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center px-5 min-h-[44px] rounded-full bg-ink/5 text-ink text-[12px] font-bold tracking-[0.06em] uppercase font-tight hover:bg-ink/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}
