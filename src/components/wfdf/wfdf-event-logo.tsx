'use client';

// WFDF event logo disc for the events grid — the remote logo when it loads,
// else the year disc. Client-only because it needs onError to swap a dead
// logo URL for the fallback at runtime (a `logoUrl != null` check alone still
// renders a broken image when the URL 404s); the events page otherwise stays a
// Server Component. Mirrors the PlayerHeadshot island pattern.

import { useCallback, useEffect, useRef, useState } from 'react';

interface WfdfEventLogoProps {
  logoUrl: string | null;
  year: number;
  // 'disc' is the events-grid chip (44px, white disc). 'hero' is the event
  // detail header mark (64px, no disc — the logo sits on the page like the
  // mobile screen's headerLogo) and renders nothing at all when there's no
  // logo, rather than falling back to a year bubble.
  variant?: 'disc' | 'hero';
}

export function WfdfEventLogo({ logoUrl, year, variant = 'disc' }: WfdfEventLogoProps) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // onError ALONE is not enough on a server-rendered <img>. The markup ships in
  // the HTML, so the browser starts (and can finish) the request before React
  // hydrates and attaches the handler — a logo that 404s early fires its error
  // event into the void and the broken image sticks forever. Verified: with
  // every logo request aborted, naturalWidth was 0 and complete was true, yet
  // no onError ever ran. So re-check the already-settled DOM node on mount.
  const checkSettled = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  useEffect(() => {
    setFailed(false);
    // Ref callbacks run before the image can finish loading on a fresh mount,
    // so re-check here too — this is the pass that catches the pre-hydration
    // failure.
    checkSettled(imgRef.current);
  }, [logoUrl, checkSettled]);

  const hero = variant === 'hero';

  if (logoUrl && !failed) {
    return (
      <span
        className={[
          'inline-flex items-center justify-center overflow-hidden flex-shrink-0',
          hero ? 'w-16 h-16' : 'w-11 h-11 rounded-full bg-white',
        ].join(' ')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          // Key by url so a src change across client-side navigations remounts
          // the <img> cleanly rather than reusing the failed DOM node.
          key={logoUrl}
          ref={(node) => {
            imgRef.current = node;
            checkSettled(node);
          }}
          src={logoUrl}
          alt=""
          width={hero ? 64 : 44}
          height={hero ? 64 : 44}
          loading="eager"
          fetchPriority="high"
          onError={() => setFailed(true)}
          className={hero ? 'w-full h-full object-contain' : 'w-full h-full object-contain p-1'}
        />
      </span>
    );
  }

  if (hero) return null;

  return (
    <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-ink/[0.06] text-[10px] font-bold text-ink font-tight flex-shrink-0">
      {year}
    </span>
  );
}
