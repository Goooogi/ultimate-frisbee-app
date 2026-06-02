'use client';

// SiteFooter — home page only.
// Identity left (logo + version), attribution right (Developed by Altius).
// Theme-aware: logo swaps light/dark via useTheme(); tokens swap via CSS vars.

import { useTheme } from '@/lib/use-theme';
import { LogoStrikeInline } from '@/components/logo-strike';

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

      {/* RIGHT — attribution */}
      <a
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
      </a>
    </footer>
  );
}
