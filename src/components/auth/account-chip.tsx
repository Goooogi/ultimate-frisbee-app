'use client';

// Shared top-bar account control.
//
// Two states:
//   - Signed out → a compact "Sign in" pill that opens a dismissible
//     AuthModal. The pill collapses to a single user icon on small screens
//     so the home header doesn't crowd.
//   - Signed in → circular initials avatar that opens a popover with the
//     user's name + email + sign-out.
//
// Loading: renders a quiet pill so the chrome height stays stable while the
// AuthProvider hydrates — prevents the "Sign in" button from flashing for
// returning users on a hard refresh.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from './auth-modal';
import { useTheme } from '@/lib/use-theme';
import type { Theme } from '@/lib/theme';

interface AccountChipProps {
  /** Avatar diameter when signed in. */
  size?: number;
  /** "compact" hides the "Sign in" label on small screens and shows just the
   *  icon, so the chip can squeeze into tight headers. Defaults to true. */
  compactOnMobile?: boolean;
  className?: string;
}

export function AccountChip({
  size = 32,
  compactOnMobile = true,
  className = '',
}: AccountChipProps) {
  const { user, loading, signOut } = useAuth();
  const [theme, setTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click + Esc.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // ── Loading: skeleton-ish pill so the header doesn't reflow. ─────────────
  if (loading) {
    return (
      <span
        aria-hidden="true"
        className={[
          'inline-flex items-center justify-center rounded-full bg-surface border border-border',
          className,
        ].join(' ')}
        style={{ width: size, height: size }}
      />
    );
  }

  // ── Signed out: icon button that opens a small popover ──────────────────
  // The popover has Sign in + Appearance (theme toggle) so mobile users can
  // switch theme even when not signed in (desktop gets ThemeToggle in the rail).
  if (!user) {
    return (
      <div ref={wrapRef} className={`relative inline-flex ${className}`}>
        <button
          type="button"
          aria-label="Sign in or open account menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={[
            'inline-flex items-center justify-center rounded-full cursor-pointer',
            'bg-ink text-bg hover:opacity-90 transition-opacity',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
          style={{ width: size, height: size }}
        >
          <SignInGlyph size={Math.round(size * 0.45)} />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-2 z-40 w-52 border border-border bg-bg rounded-md shadow-lg overflow-hidden"
          >
            {/* Sign in */}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setAuthMode('signin');
                setAuthOpen(true);
              }}
              className={[
                'w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
                'text-ink hover:bg-surface cursor-pointer transition-colors border-b border-hairline',
                'focus-visible:outline-none focus-visible:bg-surface',
              ].join(' ')}
            >
              Sign in
            </button>

            {/* Appearance / theme toggle */}
            <div className="px-3 py-2.5 flex items-center justify-between border-t border-hairline">
              <span className="text-[11px] font-bold tracking-[0.16em] uppercase font-tight text-muted">
                Appearance
              </span>
              <ThemeToggleInline theme={theme} setTheme={setTheme} />
            </div>
          </div>
        )}

        <AuthModal
          open={authOpen}
          dismissible
          initialMode={authMode}
          onDismiss={() => setAuthOpen(false)}
        />
      </div>
    );
  }

  // ── Signed in: avatar + popover ──────────────────────────────────────────
  return (
    <div ref={wrapRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={`Account — ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={user.name}
        onClick={() => setMenuOpen((v) => !v)}
        className={[
          'inline-flex items-center justify-center rounded-full bg-ink text-bg font-bold cursor-pointer',
          'hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      >
        {user.initials}
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-40 w-60 border border-border bg-bg rounded-md shadow-lg overflow-hidden"
        >
          <div className="px-3 py-3 border-b border-hairline">
            <div className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
              Signed in as
            </div>
            <div className="mt-1 text-[14px] font-bold text-ink font-tight truncate">
              {user.name}
            </div>
            <div className="text-[11px] text-muted font-tight truncate">{user.email}</div>
          </div>
          {user.isAdmin && (
            <Link
              href="/admin/content"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className={[
                'block w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
                'text-muted hover:text-ink hover:bg-surface cursor-pointer transition-colors border-b border-hairline',
                'focus-visible:outline-none focus-visible:bg-surface focus-visible:text-ink',
              ].join(' ')}
            >
              Admin
            </Link>
          )}

          {/* Appearance / theme toggle row */}
          <div className="px-3 py-2.5 flex items-center justify-between border-b border-hairline">
            <span className="text-[11px] font-bold tracking-[0.16em] uppercase font-tight text-muted">
              Appearance
            </span>
            <ThemeToggleInline theme={theme} setTheme={setTheme} />
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setMenuOpen(false);
              await signOut();
            }}
            className={[
              'w-full text-left px-3 py-2.5 text-[11px] font-bold tracking-[0.16em] uppercase font-tight',
              'text-muted hover:text-ink hover:bg-surface cursor-pointer transition-colors',
              'focus-visible:outline-none focus-visible:bg-surface focus-visible:text-ink',
            ].join(' ')}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function SignInGlyph({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3 13.5c0-2.5 2.24-4 5-4s5 1.5 5 4" />
    </svg>
  );
}

// ─── Inline theme toggle used inside the account popovers ─────────────────────
// A compact field/broadcast switch — reads and writes the same theme state as
// the rail ThemeToggle, but styled to sit inside a menu row.

function ThemeToggleInline({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const isField = theme === 'field';
  return (
    <button
      type="button"
      onClick={() => setTheme(isField ? 'broadcast' : 'field')}
      aria-label={`Switch to ${isField ? 'Broadcast' : 'Field'} theme`}
      title={`Switch to ${isField ? 'Broadcast' : 'Field'} theme`}
      className={[
        'inline-flex items-center justify-center w-8 h-8 rounded-full',
        'border border-border text-muted hover:text-ink hover:border-ink',
        'transition-colors duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      {isField ? (
        // Sun — currently Field/light, click to go dark
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="8" cy="8" r="3" />
          <line x1="8" y1="1" x2="8" y2="3" />
          <line x1="8" y1="13" x2="8" y2="15" />
          <line x1="1" y1="8" x2="3" y2="8" />
          <line x1="13" y1="8" x2="15" y2="8" />
          <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
          <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
          <line x1="12.95" y1="3.05" x2="11.54" y2="4.46" />
          <line x1="4.46" y1="11.54" x2="3.05" y2="12.95" />
        </svg>
      ) : (
        // Moon — currently Broadcast/dark, click to go light
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M13 9A6 6 0 0 1 7 3a6 6 0 1 0 6 6z" />
        </svg>
      )}
    </button>
  );
}
