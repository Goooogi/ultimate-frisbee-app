'use client';

// Player profile header avatar — a UFA headshot (watchufa.com) when available,
// else a circular initials monogram. Client-only because it needs onError to
// swap a broken/expired image URL for the monogram at runtime; the parent
// profile header otherwise stays a Server Component.
import { useState } from 'react';

interface PlayerHeadshotProps {
  headshotUrl: string | null;
  displayName: string;
  /** Pixel size of the circular avatar. Defaults to 88 (desktop-friendly, still fits 375px). */
  size?: number;
}

export function PlayerHeadshot({ headshotUrl, displayName, size = 88 }: PlayerHeadshotProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(headshotUrl) && !imgFailed;

  if (showImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={headshotUrl!}
        alt={`${displayName} headshot`}
        onError={() => setImgFailed(true)}
        className="h-full w-full rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center rounded-full bg-ink/5 text-muted"
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
