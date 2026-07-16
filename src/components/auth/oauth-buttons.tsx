'use client';

// Google / Apple OAuth sign-in buttons for the auth modal. Each button renders
// only when its provider flag is on (NEXT_PUBLIC_OAUTH_GOOGLE / _APPLE) so we
// never ship a button that errors before the provider is configured in Supabase.
// Renders nothing (incl. the divider) when no provider is enabled — the modal
// then looks exactly as it did before.

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { OAUTH_GOOGLE_ENABLED, OAUTH_APPLE_ENABLED } from '@/lib/supabase/env';

interface OAuthButtonsProps {
  /** Same-origin path to land on after auth (default / — home). */
  next?: string;
}

export function OAuthButtons({ next }: OAuthButtonsProps) {
  const { signInWithOAuth } = useAuth();
  // Which provider is mid-redirect (disables both while one is starting).
  const [pending, setPending] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const anyEnabled = OAUTH_GOOGLE_ENABLED || OAUTH_APPLE_ENABLED;
  if (!anyEnabled) return null;

  async function go(provider: 'google' | 'apple') {
    setError(null);
    setPending(provider);
    const res = await signInWithOAuth(provider, next);
    // On success the browser redirects away; only reached on failure.
    if (res.error) {
      setError('Could not start sign-in. Please try again.');
      setPending(null);
    }
  }

  return (
    <div className="px-6 pt-2 flex flex-col gap-2.5">
      {OAUTH_GOOGLE_ENABLED && (
        <ProviderButton
          label="Continue with Google"
          onClick={() => go('google')}
          disabled={pending !== null}
          loading={pending === 'google'}
          icon={<GoogleIcon />}
        />
      )}
      {OAUTH_APPLE_ENABLED && (
        <ProviderButton
          label="Continue with Apple"
          onClick={() => go('apple')}
          disabled={pending !== null}
          loading={pending === 'apple'}
          icon={<AppleIcon />}
        />
      )}

      {error && (
        <p role="alert" className="text-[12px] text-live font-tight px-1">
          {error}
        </p>
      )}

      {/* "or" divider between OAuth and the email/password form. */}
      <div className="flex items-center gap-3 pt-1.5" aria-hidden="true">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint font-tight">
          or
        </span>
        <span className="h-px flex-1 bg-hairline" />
      </div>
    </div>
  );
}

function ProviderButton({
  label,
  icon,
  onClick,
  disabled,
  loading,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2.5 w-full py-3 rounded-full cursor-pointer',
        'bg-surface text-ink ring-1 ring-inset ring-hairline',
        'font-tight text-[13px] font-semibold',
        'hover:bg-ink/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      ].join(' ')}
    >
      {loading ? (
        <span
          className="w-4 h-4 rounded-full border-2 border-ink/20 border-t-ink animate-spin"
          aria-hidden="true"
        />
      ) : (
        <span className="flex-shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </button>
  );
}

// Official Google "G" mark (4-color).
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 010-3.44V4.95H.96a9 9 0 000 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

// Apple logo — single-color, uses currentColor so it adapts to the theme.
function AppleIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden="true">
      <path d="M13.29 9.54c-.02-1.9 1.55-2.81 1.62-2.86-.88-1.29-2.26-1.47-2.75-1.49-1.17-.12-2.28.69-2.87.69-.59 0-1.5-.67-2.47-.65-1.27.02-2.44.74-3.09 1.87-1.32 2.29-.34 5.68.95 7.54.63.91 1.38 1.93 2.36 1.9.95-.04 1.31-.61 2.46-.61 1.15 0 1.47.61 2.47.59 1.02-.02 1.67-.93 2.29-1.85.72-1.06 1.02-2.09 1.04-2.14-.02-.01-1.99-.76-2.01-3.03zM11.4 3.86c.52-.63.87-1.51.77-2.39-.75.03-1.66.5-2.2 1.13-.48.56-.9 1.45-.79 2.31.84.06 1.7-.42 2.22-1.05z" />
    </svg>
  );
}
