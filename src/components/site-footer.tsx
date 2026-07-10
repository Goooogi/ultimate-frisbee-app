'use client';

// SiteFooter — home page only.
// Identity left (logo + version), attribution right (Developed by Altius).
// Theme-aware: logo swaps light/dark via useTheme(); tokens swap via CSS vars.

import Link from 'next/link';
import { DiscFlight } from '@/components/logo-strike';

// Top-level destinations surfaced in the footer brand bar. Kept short and
// scannable (per the slim brand-bar direction) — the full nav lives in the rail.
const FOOTER_LINKS: { label: string; href: string }[] = [
  { label: 'Scores', href: '/scores' },
  { label: 'Playbook', href: '/playbook' },
  { label: 'Fantasy', href: '/fantasy' },
];

// Used by the (currently hidden) Altius attribution below — kept for restore.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ExternalArrow() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="inline-block ml-[3px] mb-[1px] flex-shrink-0"
    >
      <path
        d="M2 8L8 2M8 2H3.5M8 2V6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer className="px-5 lg:px-12 pb-10 lg:pb-12 pt-2">
      <div className="bg-ink text-bg rounded-card-xl px-6 py-7 lg:px-10 lg:py-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          {/* LEFT — wordmark + tagline. This card's background is ALWAYS
              ink-colored regardless of theme (dark in field, light cream in
              broadcast — see the shadow-guide note on the intentional
              inversion), so the wordmark text uses `text-bg` directly rather
              than LogoStrikeInline (which hardcodes `text-ink`, correct only
              when its surrounding surface follows the page theme). */}
          <div className="flex flex-col gap-1.5">
            <div className="inline-flex items-center gap-2 font-display" style={{ lineHeight: 1 }}>
              <span
                className="font-semibold italic uppercase text-bg/70"
                style={{ fontSize: 12 * 0.85, letterSpacing: '0.2em', transform: 'translateY(-1px)' }}
              >
                The
              </span>
              <span
                className="font-bold italic uppercase text-bg"
                style={{ fontSize: 28 * 0.85, letterSpacing: '-0.005em' }}
              >
                Layout
              </span>
              {/* Disc uses a fixed warm coral rather than the theme accent —
                  the theme's lime accent fails contrast against broadcast's
                  inverted (light cream) footer card. text-bg/40 ring keeps
                  the inner rings visible against either card polarity. */}
              <DiscFlight size={24 * 0.85} color="#FF3D00" ring="rgb(var(--bg) / 0.4)" tilt={-12} />
            </div>
            <span className="text-[12px] text-bg/60 font-tight">
              Every league, one place.
            </span>
          </div>

          {/* RIGHT — quick links + social */}
          <div className="flex items-center gap-5 self-start sm:self-auto">
            <nav aria-label="Footer" className="flex items-center gap-4">
              {FOOTER_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={[
                    'text-[12px] font-bold tracking-[0.1em] uppercase font-tight text-bg/60 no-underline',
                    'motion-safe:transition-colors motion-safe:duration-150 hover:text-bg',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
                  ].join(' ')}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <span className="w-px h-4 bg-bg/15" aria-hidden="true" />
            {/* Instagram, deep-linking into the native app on mobile. */}
            <InstagramLink />
          </div>
        </div>

        {/* BOTTOM — copyright + version + legal links. Leaves a clean slot to
            restore the "Developed by Altius" attribution (below) later. */}
        <div className="mt-7 pt-5 border-t border-bg/10 flex items-center justify-between gap-4">
          <span className="text-[10px] font-bold tracking-[0.16em] text-bg/45 uppercase font-tight">
            © 2026 The Layout · v0.1
          </span>

          {/* Legal */}
          <nav aria-label="Legal" className="flex items-center gap-4">
            {[
              { label: 'Terms', href: '/terms' },
              { label: 'Privacy', href: '/privacy' },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={[
                  'text-[10px] font-bold tracking-[0.16em] uppercase font-tight text-bg/45 no-underline',
                  'motion-safe:transition-colors motion-safe:duration-150 hover:text-bg',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
                ].join(' ')}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Attribution. Hidden for now (per Hunter); restore this block to show
              "Developed by Altius" again in the future. */}
          {/* <a
            href="https://altiusapps.com"
            target="_blank"
            rel="noopener noreferrer"
            className={[
              'group text-[12px] text-bg/60 font-tight',
              'motion-safe:transition-colors motion-safe:duration-150 hover:text-bg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
            ].join(' ')}
          >
            Developed by{' '}
            <span className="text-bg font-bold group-hover:text-accent motion-safe:transition-colors motion-safe:duration-150">
              Altius
            </span>
            <ExternalArrow />
          </a> */}
        </div>
      </div>
    </footer>
  );
}

const IG_HANDLE = 'layout.ultimate';
const IG_WEB = `https://www.instagram.com/${IG_HANDLE}/`;
// The app scheme Instagram registers on iOS/Android. Opening it hands the tap
// straight to the native app if it's installed.
const IG_APP = `instagram://user?username=${IG_HANDLE}`;

function InstagramLink() {
  // The href stays the web URL so it always works (SSR, crawlers, no-JS, and
  // desktop). On a touch device we intercept the tap and try the app scheme
  // first, falling back to the web URL if the app doesn't take over quickly.
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === 'undefined') return;
    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    if (!isMobile) return; // desktop → let the normal web link open

    e.preventDefault();
    // Try to open the native app. If it succeeds, the browser backgrounds and
    // our fallback timer never fires; if nothing handles the scheme, we send
    // the user to the web profile after a short beat.
    const fallback = window.setTimeout(() => {
      window.location.href = IG_WEB;
    }, 700);
    // If the app opens, the page is hidden — cancel the web fallback.
    const onHide = () => {
      if (document.hidden) window.clearTimeout(fallback);
    };
    document.addEventListener('visibilitychange', onHide, { once: true });
    window.location.href = IG_APP;
  };

  return (
    <a
      href={IG_WEB}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="The Layout on Instagram (@layout.ultimate)"
      className={[
        'inline-flex items-center justify-center w-11 h-11 -m-1 rounded-lg',
        'opacity-90 hover:opacity-100',
        'motion-safe:transition-opacity motion-safe:duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/instagram.png" alt="" width={24} height={24} className="w-6 h-6" />
    </a>
  );
}
