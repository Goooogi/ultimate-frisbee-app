'use client';

// Player profile header avatar — a self-hosted UFA headshot when available,
// else a circular initials monogram. Client-only because it needs onError to
// swap a broken/expired image URL for the monogram at runtime; the parent
// profile header otherwise stays a Server Component.
import { useCallback, useEffect, useRef, useState } from 'react';

interface PlayerHeadshotProps {
  headshotUrl: string | null;
  displayName: string;
  /** Font-size basis for the monogram initials. Defaults to 88. */
  size?: number;
}

// Headshots are stored in the `ufa-headshots` Storage bucket. We serve the
// stored object DIRECTLY (plain `/object/` URL) — NOT Supabase's image transform
// endpoint. Image transformations are metered per unique origin image per billing
// cycle (Pro plan: 100/cycle), and these ~100 KB originals are already small
// enough to serve as-is (CDN-cached for a year via the bucket's cacheControl).
// Serving plain objects costs nothing against the transform quota.
/** Native render box in CSS px (88 desktop) × 2 for retina — sets width/height
 *  attributes only; the object is served at its stored resolution. */
const RENDER_PX = 176;

export function PlayerHeadshot({ headshotUrl, displayName, size = 88 }: PlayerHeadshotProps) {
  // `imgFailed` latches to the monogram only after we've exhausted a retry.
  // It MUST reset when the player (headshotUrl) changes — otherwise a failure on
  // one profile carries the monogram into the next player during client-side
  // navigation, since React reuses this component instance. This was the main
  // "I saw my photo before, now it never shows" cause.
  const [imgFailed, setImgFailed] = useState(false);
  // Retry counter also resets per-url. One transient hiccup (rate-limit, a
  // cancelled fetch, a flaky moment) shouldn't kill the image forever — retry
  // once with a cache-busting param before falling back to the monogram.
  const [attempt, setAttempt] = useState(0);
  const MAX_ATTEMPTS = 2;
  const prevUrl = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // onError alone misses a failure that completes BEFORE hydration attaches the
  // handler — this component server-renders, so the browser can finish (and
  // fail) the request while React is still booting. The error event fires into
  // the void and the broken image sticks. So also inspect the settled DOM node
  // and route it through the same retry→monogram path onError would take.
  // (Proven on the WFDF event logo: naturalWidth 0, complete true, onError
  // never ran. See vault Ops/Recurring Bug Classes.)
  const failOnce = useCallback(() => {
    setAttempt((a) => {
      if (a + 1 < MAX_ATTEMPTS) return a + 1;
      setImgFailed(true);
      return a;
    });
  }, []);

  const checkSettled = useCallback(
    (node: HTMLImageElement | null) => {
      if (node && node.complete && node.naturalWidth === 0) failOnce();
    },
    [failOnce],
  );

  useEffect(() => {
    if (prevUrl.current !== headshotUrl) {
      prevUrl.current = headshotUrl;
      setImgFailed(false);
      setAttempt(0);
      return;
    }
    // Same url: catch a load that already settled as broken pre-hydration.
    checkSettled(imgRef.current);
  }, [headshotUrl, checkSettled]);

  const showImage = Boolean(headshotUrl) && !imgFailed;

  if (showImage) {
    const base = headshotUrl!; // plain stored object — no transform rewrite
    // On the retry, append a cache-buster so a poisoned/edge-cached transient
    // error isn't just replayed from cache. (Plain object → no transform quota
    // cost from the extra variant.)
    const src = attempt > 0 ? `${base}${base.includes('?') ? '&' : '?'}r=${attempt}` : base;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        // Key by url so a src change across navigations remounts the <img>
        // cleanly (fresh load, no stale error state on the DOM node).
        key={headshotUrl!}
        ref={(node) => {
          imgRef.current = node;
          checkSettled(node);
        }}
        src={src}
        alt={`${displayName} headshot`}
        width={RENDER_PX}
        height={RENDER_PX}
        // Above-the-fold profile avatar — eager + high priority. Lazy-loading
        // here only added a failure window (and delayed the primary image).
        fetchPriority="high"
        decoding="async"
        onError={failOnce}
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
