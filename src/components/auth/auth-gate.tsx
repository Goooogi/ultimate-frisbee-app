'use client';

// Auth gate for the playbook.
//
// Flow:
//   - While AuthProvider is hydrating → quiet loading state (no flash of the
//     gate to returning users with a fresh session).
//   - Signed in → render the gated children.
//   - Signed out → render a real landing screen with two clear paths:
//       1) "Sign in / create account" → opens a dismissible AuthModal
//       2) "Back to home" → exit to / (so users aren't trapped here)
//     We intentionally don't auto-pop the modal. Earlier version did, and
//     it left users with no obvious exit when they weren't ready to sign up.

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { LogoStrikeInline } from '@/components/logo-strike';
import { useTheme } from '@/lib/use-theme';
import { AuthModal } from './auth-modal';

interface AuthGateProps {
  /** Headline on the gate landing + (when opened) the modal. */
  headline?: string;
  /** Subhead shown on the landing. */
  subhead?: string;
  /** Prefill the auth modal's email (e.g. the address a team invite was sent
   *  to). When set, the modal opens in CREATE-ACCOUNT mode with the email
   *  filled in — new invitees don't retype it. */
  initialEmail?: string;
  children: React.ReactNode;
}

export function AuthGate({
  headline = 'Pull up your playbook.',
  subhead = 'Sign in to save plays, switch teams, and pick up exactly where you left off.',
  initialEmail,
  children,
}: AuthGateProps) {
  const { user, loading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  // Invitees (initialEmail set) default to create-account; everyone else to sign-in.
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(
    initialEmail ? 'signup' : 'signin',
  );
  const [theme] = useTheme();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-faint">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase font-tight">
          Loading…
        </span>
      </div>
    );
  }

  if (user) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Top bar — logo (links home) + a small "Back home" affordance so the
          user can always escape without scrolling. */}
      <header className="flex items-center justify-between px-5 lg:px-12 py-5 border-b border-hairline">
        <Link href="/" aria-label="The Layout — home" className="inline-flex">
          <LogoStrikeInline
            accentColor="rgb(var(--accent))"
            theme={theme === 'broadcast' ? 'dark' : 'light'}
            size={1.0}
          />
        </Link>
        <Link
          href="/"
          className={[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-surface',
            'text-[10px] font-bold tracking-[0.16em] uppercase text-muted hover:text-ink font-tight',
            'no-underline transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          <BackGlyph />
          Back home
        </Link>
      </header>

      {/* Landing — eyebrow + italic headline + body + dual CTA */}
      <main className="flex-1 flex items-center justify-center px-5 py-12 lg:py-20">
        <div className="text-center flex flex-col items-center gap-5 max-w-[560px]">
          <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            The Playbook · Beta
          </span>
          <h1 className="m-0 font-display italic font-bold text-[44px] lg:text-[64px] leading-[0.92] tracking-[-0.04em] text-ink">
            {headline}
          </h1>
          <p className="text-[14px] lg:text-[15px] text-muted font-tight max-w-[460px] leading-snug">
            {subhead}
          </p>

          {/* CTAs — primary "Sign in / create" opens the modal, secondary
              returns home so the user always has a clean exit. */}
          <div className="mt-3 flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setAuthOpen(true);
              }}
              className={[
                'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md cursor-pointer',
                'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase',
                'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity',
              ].join(' ')}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('signup');
                setAuthOpen(true);
              }}
              className={[
                'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md cursor-pointer',
                'bg-surface border border-border text-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase',
                'hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors',
              ].join(' ')}
            >
              Create account
            </button>
          </div>

          <Link
            href="/"
            className="mt-2 text-[11px] font-bold tracking-[0.16em] uppercase text-faint hover:text-ink no-underline transition-colors font-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
          >
            Maybe later
          </Link>
        </div>
      </main>

      <AuthModal
        open={authOpen}
        dismissible
        initialMode={authMode}
        initialEmail={initialEmail}
        onDismiss={() => setAuthOpen(false)}
        headline={authMode === 'signup' ? 'Make it yours.' : headline}
      />
    </div>
  );
}

function BackGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 1.5L2.5 5L6 8.5" />
    </svg>
  );
}
