'use client';

// SiteFooter — home page only.
// Identity left (logo + version), attribution right (Developed by Altius).
// Theme-aware: logo swaps light/dark via useTheme(); tokens swap via CSS vars.

import Link from 'next/link';
import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';

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
  const [theme] = useTheme();

  return (
    <footer className="border-t border-hairline px-5 lg:px-12 py-8 lg:py-9">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* LEFT — wordmark + tagline */}
        <div className="flex flex-col gap-1.5">
          <LogoStrikeInline
            accentColor="rgb(var(--accent))"
            theme={theme === 'broadcast' ? 'dark' : 'light'}
            size={0.85}
          />
          <span className="text-[12px] text-muted font-tight">
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
                  'text-[12px] font-bold tracking-[0.1em] uppercase font-tight text-muted no-underline',
                  'motion-safe:transition-colors motion-safe:duration-150 hover:text-ink',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
                ].join(' ')}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="w-px h-4 bg-hairline" aria-hidden="true" />
          {/* Instagram, deep-linking into the native app on mobile. */}
          <InstagramLink />
        </div>
      </div>

      {/* BOTTOM — copyright + version + legal links. Leaves a clean slot to
          restore the "Developed by Altius" attribution (below) later. */}
      <div className="mt-7 pt-5 border-t border-hairline flex items-center justify-between gap-4">
        <span className="text-[10px] font-bold tracking-[0.16em] text-faint uppercase font-tight">
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
                'text-[10px] font-bold tracking-[0.16em] uppercase font-tight text-faint no-underline',
                'motion-safe:transition-colors motion-safe:duration-150 hover:text-ink',
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
            'group text-[12px] text-muted font-tight',
            'motion-safe:transition-colors motion-safe:duration-150 hover:text-ink',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
          ].join(' ')}
        >
          Developed by{' '}
          <span className="text-ink font-bold group-hover:text-accent motion-safe:transition-colors motion-safe:duration-150">
            Altius
          </span>
          <ExternalArrow />
        </a> */}
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
