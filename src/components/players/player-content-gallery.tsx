'use client';

// Approved content gallery on /players/[id].
// Server fetches via getApprovedContentForPlayer and passes initial rows in;
// after the uploader submits a new pending item, the parent simply refreshes
// via router.refresh() (we don't optimistically show pending submissions
// because by design they're not public until reviewed).

import { useState } from 'react';
import { PlayerContentUploader } from './player-content-uploader';
import type { PlayerContentItem, PlayerKind } from '@/lib/player-content/types';
import { useRouter } from 'next/navigation';

interface Props {
  playerKind: PlayerKind;
  playerRef: string;
  playerDisplayName: string;
  items: PlayerContentItem[];
}

export function PlayerContentGallery({ playerKind, playerRef, playerDisplayName, items }: Props) {
  const router = useRouter();
  const [lightbox, setLightbox] = useState<PlayerContentItem | null>(null);

  return (
    <section className="mt-10" aria-labelledby="content-heading">
      <div className="flex items-baseline justify-between mb-3">
        <h2
          id="content-heading"
          className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight"
        >
          Content
        </h2>
        {items.length > 0 && (
          <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      <div className="mb-4">
        <PlayerContentUploader
          playerKind={playerKind}
          playerRef={playerRef}
          playerDisplayName={playerDisplayName}
          onSubmitted={() => {
            // Show the "submitted for review" affordance via a tiny inline
            // toast on the next render; for now, refresh to clear forms +
            // surface any future server-side flags.
            router.refresh();
          }}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {items.map((item) => (
            <ContentTile key={item.id} item={item} onClick={() => setLightbox(item)} />
          ))}
        </div>
      )}

      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}
    </section>
  );
}

function ContentTile({ item, onClick }: { item: PlayerContentItem; onClick: () => void }) {
  if (item.kind === 'image' && item.publicUrl) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group relative aspect-square overflow-hidden rounded-sm bg-surface border border-hairline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.publicUrl}
          alt={item.caption ?? ''}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          loading="lazy"
        />
        {item.caption && (
          <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-bg bg-black/60 truncate font-tight">
            {item.caption}
          </span>
        )}
      </button>
    );
  }

  // Generic link — render as a clickable card that opens the URL in a new tab.
  if (item.kind === 'link' && item.external_url) {
    const displayHost = (() => {
      try { return new URL(item.external_url).hostname.replace(/^www\./, ''); } catch { return item.external_url; }
    })();
    return (
      <a
        href={item.external_url}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative aspect-square overflow-hidden rounded-sm bg-surface border border-hairline flex flex-col items-center justify-center gap-1.5 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer hover:bg-bg transition-colors"
      >
        {/* Link glyph */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-faint group-hover:text-ink transition-colors flex-shrink-0">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
        </svg>
        <span className="text-[10px] font-tight text-muted group-hover:text-ink transition-colors truncate max-w-full text-center">
          {displayHost}
        </span>
        {item.caption && (
          <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-muted bg-surface/90 truncate font-tight text-center">
            {item.caption}
          </span>
        )}
      </a>
    );
  }

  // Video file or external video link — show a poster with a play badge.
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative aspect-square overflow-hidden rounded-sm bg-black border border-hairline flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
    >
      <PlayBadge />
      <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-bg bg-black/60 truncate font-tight">
        {item.kind === 'video_link' ? 'Video link' : 'Video'}
        {item.caption ? ` · ${item.caption}` : ''}
      </span>
    </button>
  );
}

function Lightbox({ item, onClose }: { item: PlayerContentItem; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-4 right-4 text-bg text-[11px] font-bold tracking-[0.18em] uppercase font-tight hover:opacity-80 cursor-pointer"
      >
        Close
      </button>
      <div
        className="max-w-[min(100%,1200px)] max-h-[90vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {item.kind === 'image' && item.publicUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.publicUrl}
            alt={item.caption ?? ''}
            className="max-h-[80vh] w-auto object-contain rounded-sm"
          />
        )}
        {item.kind === 'video' && item.publicUrl && (
          <video
            src={item.publicUrl}
            controls
            playsInline
            className="max-h-[80vh] w-auto object-contain bg-black rounded-sm"
          />
        )}
        {item.kind === 'video_link' && item.embedUrl && (
          <div className="w-[min(90vw,960px)] aspect-video">
            <iframe
              src={item.embedUrl}
              title={item.caption ?? 'Video'}
              className="w-full h-full rounded-sm"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {item.kind === 'link' && item.external_url && (
          <div className="flex flex-col items-center gap-4 max-w-[min(90vw,480px)] text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-faint flex-shrink-0">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            <a
              href={item.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-bg text-[13px] font-tight underline underline-offset-2 hover:opacity-80 break-all"
            >
              {item.external_url}
            </a>
          </div>
        )}
        {item.caption && (
          <p className="text-bg text-[12px] font-tight text-center max-w-[80ch]">{item.caption}</p>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-8 rounded-md border border-dashed border-border bg-surface text-center">
      <p className="text-[12px] text-muted font-tight">
        No content yet. Be the first to add a photo or highlight reel.
      </p>
    </div>
  );
}

function PlayBadge() {
  return (
    <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-bg/90 text-ink">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7-11-7z" />
      </svg>
    </span>
  );
}
