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

  // ── Signed out: "Sign in" pill ───────────────────────────────────────────
  if (!user) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setAuthMode('signin');
            setAuthOpen(true);
          }}
          aria-label="Sign in or create account"
          className={[
            'inline-flex items-center gap-1.5 rounded-full cursor-pointer',
            'bg-ink text-bg hover:opacity-90 transition-opacity',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            'text-[10px] font-bold tracking-[0.16em] uppercase font-tight',
            // Compact icon-only on mobile, full pill on >=sm.
            compactOnMobile
              ? 'p-0 sm:px-3 sm:py-1.5'
              : 'px-3 py-1.5',
            className,
          ].join(' ')}
          style={
            compactOnMobile
              ? {
                  // Keep the icon-only state square at the avatar size.
                  minWidth: size,
                  minHeight: size,
                }
              : undefined
          }
        >
          <SignInGlyph
            size={Math.round(size * 0.45)}
            className={compactOnMobile ? 'sm:hidden mx-auto' : 'hidden'}
          />
          <span className={compactOnMobile ? 'hidden sm:inline' : ''}>Sign in</span>
        </button>

        <AuthModal
          open={authOpen}
          dismissible
          initialMode={authMode}
          onDismiss={() => setAuthOpen(false)}
        />
      </>
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
