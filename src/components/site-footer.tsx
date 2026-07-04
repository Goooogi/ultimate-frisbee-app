'use client';

// SiteFooter — home page only.
// Identity left (logo + version), attribution right (Developed by Altius).
// Theme-aware: logo swaps light/dark via useTheme(); tokens swap via CSS vars.

import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';

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
    <footer
      className={[
        'border-t border-hairline',
        'px-5 lg:px-12',
        'py-8 lg:py-10',
        'flex flex-col gap-4',
        'lg:flex-row lg:items-center lg:justify-between',
      ].join(' ')}
    >
      {/* LEFT — wordmark + version */}
      <div className="flex flex-col gap-2">
        <LogoStrikeInline
          accentColor="rgb(var(--accent))"
          theme={theme === 'broadcast' ? 'dark' : 'light'}
          size={0.85}
        />
        <span className="text-[10px] font-bold tracking-[0.16em] text-faint uppercase font-tight">
          v0.1 · 2026 season
        </span>
      </div>

      {/* RIGHT — social. Instagram, deep-linking into the native app on mobile. */}
      <div className="flex items-center gap-4 self-start lg:self-auto">
        <InstagramLink />
      </div>

      {/* Attribution. Hidden for now (per Hunter); restore this block to show
          "Developed by Altius" again in the future. */}
      {/* <a
        href="https://altiusapps.com"
        target="_blank"
        rel="noopener noreferrer"
        className={[
          'group text-[12px] lg:text-[13px] text-muted font-tight',
          'motion-safe:transition-colors motion-safe:duration-150',
          'hover:text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
          'self-start lg:self-auto',
        ].join(' ')}
      >
        Developed by{' '}
        <span className="text-ink font-bold group-hover:text-accent motion-safe:transition-colors motion-safe:duration-150">
          Altius
        </span>
        <ExternalArrow />
      </a> */}
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
        'inline-flex items-center justify-center w-9 h-9 rounded-full',
        'text-muted hover:text-ink',
        'motion-safe:transition-colors motion-safe:duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      <InstagramGlyph />
    </a>
  );
}

function InstagramGlyph() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
