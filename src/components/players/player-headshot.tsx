'use client';

// Player profile header avatar — a self-hosted UFA headshot when available,
// else a circular initials monogram. Client-only because it needs onError to
// swap a broken/expired image URL for the monogram at runtime; the parent
// profile header otherwise stays a Server Component.
import { useState } from 'react';

interface PlayerHeadshotProps {
  headshotUrl: string | null;
  displayName: string;
  /** Font-size basis for the monogram initials. Defaults to 88. */
  size?: number;
}

// Headshots are stored in the `ufa-headshots` Storage bucket as full-size
// originals. We serve them through Supabase's image transform so the browser
// downloads a small (~6 KB) resized+recompressed avatar instead of a multi-MB
// original — fast + CDN-cached. Only rewrite OUR bucket objects; any legacy
// watchufa hotlink (pre-migration) is used as-is.
const STORAGE_OBJECT = '/storage/v1/object/public/ufa-headshots/';
const STORAGE_RENDER = '/storage/v1/render/image/public/ufa-headshots/';
/** Display size in CSS px (88 desktop) × 2 for retina. */
const RENDER_PX = 176;

function displaySrc(url: string): string {
  if (!url.includes(STORAGE_OBJECT)) return url; // legacy/watchufa → as-is
  const rendered = url.replace(STORAGE_OBJECT, STORAGE_RENDER);
  const sep = rendered.includes('?') ? '&' : '?';
  return `${rendered}${sep}width=${RENDER_PX}&height=${RENDER_PX}&resize=cover&quality=80`;
}

export function PlayerHeadshot({ headshotUrl, displayName, size = 88 }: PlayerHeadshotProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(headshotUrl) && !imgFailed;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={displaySrc(headshotUrl!)}
        alt={`${displayName} headshot`}
        width={RENDER_PX}
        height={RENDER_PX}
        loading="lazy"
        decoding="async"
        onError={() => setImgFailed(true)}
        className="h-full w-full rounded-xl object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center rounded-xl bg-ink/5 text-muted"
    >
      <span
        className="font-display italic font-bold"
        style={{ fontSize: size * 0.32 }}
      >
        {initialsOf(displayName)}
      </span>
    </span>
  );
}

// First letter of the first word + first letter of the last word (e.g. "Tobe
// Decraene" -> "TD"). Falls back to a single letter for one-word names.
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0][0]?.toUpperCase() ?? '';
  const first = words[0][0] ?? '';
  const last = words[words.length - 1][0] ?? '';
  return (first + last).toUpperCase();
}
