'use client';

// ResetPasswordClient — renders on /reset-password, the redirectTo target
// for Supabase password-reset emails.
//
// Flow:
//   1. User clicks the link in the reset email.
//   2. Supabase appends a recovery token to the URL hash.
//   3. The Supabase browser client detects the hash on mount
//      (detectSessionInUrl is true by default in createBrowserClient)
//      and fires PASSWORD_RECOVERY, establishing a recovery session.
//   4. We listen via onAuthStateChange and flip `hasRecoverySession` to true,
//      showing the set-new-password form.
//   5. On submit, updatePassword() calls supabase.auth.updateUser({ password })
//      which is valid inside a recovery session.
//   6. On success, redirect to /playbook after a brief confirmation pause.
//
// If no recovery session is found (link expired, already used, direct nav):
//   → show an error state with a link back to /playbook to start over.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { createClient } from '@/lib/supabase/client';

type PageState = 'detecting' | 'ready' | 'success' | 'expired';

export function ResetPasswordClient() {
  const { updatePassword } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [pageState, setPageState] = useState<PageState>('detecting');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // Show the set-new-password form ONLY for a genuine password-recovery arrival,
  // never for a user who merely happens to be signed in and navigates here.
  //
  // The unambiguous signal that the user came from a reset email is the
  // recovery token in the URL hash (`#...type=recovery...`) or query
  // (`?...type=recovery` / `?code=` for the PKCE flow). We gate on that FIRST.
  // If it's absent, this is a direct navigation → 'expired', even if a normal
  // session exists. Then we wait for Supabase's PASSWORD_RECOVERY event (or an
  // already-exchanged recovery session) before revealing the form.
  useEffect(() => {
    let mounted = true;

    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const arrivedViaRecovery =
      /type=recovery/.test(hash) ||
      /type=recovery/.test(search) ||
      // PKCE recovery flow lands with a ?code= param and no type.
      /[?&]code=/.test(search);

    if (!arrivedViaRecovery) {
      // No recovery token in the URL — a signed-in user landing here directly
      // must NOT see the change-password form. Treat as invalid.
      setPageState('expired');
      return () => {
        mounted = false;
      };
    }

    // Token IS present. Supabase's browser client exchanges it asynchronously
    // and fires PASSWORD_RECOVERY. Listen for it; also poll getSession() once
    // in case the exchange completed before this effect attached.
    const reveal = () => {
      if (!mounted) return;
      setPageState((s) => (s === 'detecting' ? 'ready' : s));
      setTimeout(() => passwordRef.current?.focus(), 30);
    };

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') reveal();
    });

    // Fast-path: the recovery session may already exist if the exchange beat us.
    // Safe here because we've already confirmed the recovery token is in the URL.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) reveal();
    });

    // If the token is present but the exchange never resolves (malformed/expired
    // token), fall back to the expired state.
    const fallback = setTimeout(() => {
      if (!mounted) return;
      setPageState((s) => (s === 'detecting' ? 'expired' : s));
    }, 4000);

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
      clearTimeout(fallback);
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    const result = await updatePassword(newPassword);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setPageState('success');
    // Brief confirmation pause before routing to /playbook.
    setTimeout(() => router.push('/playbook'), 1500);
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 lg:px-12 py-5 border-b border-hairline">
        <Link
          href="/playbook"
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted hover:text-ink no-underline font-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
        >
          ← The Playbook
        </Link>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-center justify-center px-5 py-12 lg:py-20">
        <div className="w-full max-w-[440px] flex flex-col items-center gap-5 text-center">
          <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            The Playbook
          </span>

          {/* ── Detecting (hash token exchange in progress) ─────────── */}
          {pageState === 'detecting' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                One moment…
              </h1>
              <p className="text-[14px] text-muted font-tight">
                Verifying your reset link.
              </p>
            </>
          )}

          {/* ── Expired / invalid ───────────────────────────────────── */}
          {pageState === 'expired' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                Link expired.
              </h1>
              <p className="text-[14px] text-muted font-tight max-w-[380px]">
                This reset link has expired or has already been used. Head back
                to the Playbook and request a new one.
              </p>
              <Link
                href="/playbook"
                className="inline-flex items-center justify-center gap-2 mt-2 px-5 py-3 rounded-md bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase no-underline hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent min-h-[44px]"
              >
                Back to playbook
              </Link>
            </>
          )}

          {/* ── Success ─────────────────────────────────────────────── */}
          {pageState === 'success' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                Password updated.
              </h1>
              <p className="text-[14px] text-muted font-tight">
                You&apos;re all set. Routing you to your playbook…
              </p>
            </>
          )}

          {/* ── Set new password form ────────────────────────────────── */}
          {pageState === 'ready' && (
            <form
              onSubmit={handleSubmit}
              className="w-full bg-bg border border-border rounded-md shadow-xl flex flex-col text-left"
              aria-label="Set new password"
              noValidate
            >
              <div className="px-6 pt-6 pb-2 flex flex-col gap-2">
                <h1 className="m-0 font-display italic font-bold text-[32px] leading-[0.95] tracking-[-0.03em] text-ink">
                  Set new password.
                </h1>
                <p className="text-[13px] text-muted font-tight leading-snug">
                  Choose a strong password of at least 8 characters.
                </p>
              </div>

              <div className="px-6 py-4 flex flex-col gap-3.5">
                {/* New password */}
                <ResetField label="New password" hint="8+ characters">
                  <PasswordInput
                    inputRef={passwordRef}
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="Pick something strong"
                    autoComplete="new-password"
                    show={showPassword}
                    onToggleShow={() => setShowPassword((v) => !v)}
                  />
                </ResetField>

                {/* Confirm password */}
                <ResetField label="Confirm password">
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Type it again"
                    autoComplete="new-password"
                    show={showPassword}
                    onToggleShow={() => setShowPassword((v) => !v)}
                    mismatch={confirmPassword.length > 0 && confirmPassword !== newPassword}
                  />
                </ResetField>

                {error && (
                  <div
                    role="alert"
                    className="text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2"
                  >
                    {error}
                  </div>
                )}
              </div>

              <div className="px-6 pb-6">
                <button
                  type="submit"
                  disabled={submitting}
                  className={[
                    'inline-flex items-center justify-center gap-2 w-full py-3 rounded-md cursor-pointer min-h-[44px]',
                    'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase',
                    'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  ].join(' ')}
                >
                  {submitting ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Local UI primitives (mirrors auth-modal.tsx idioms) ──────────────────────

function ResetField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
          {label}
        </span>
        {hint && (
          <span className="text-[9px] font-medium text-faint font-tight normal-case tracking-normal">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function PasswordInput({
  inputRef,
  value,
  onChange,
  placeholder,
  autoComplete,
  show,
  onToggleShow,
  mismatch,
}: {
  inputRef?: React.RefObject<HTMLInputElement>;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
  mismatch?: boolean;
}) {
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        minLength={8}
        aria-label={placeholder}
        className={[
          'w-full bg-surface border px-3 py-2.5 pr-10 text-[14px] font-semibold text-ink font-tight rounded',
          'focus-visible:outline-none transition-colors',
          mismatch
            ? 'border-live focus-visible:border-live'
            : 'border-border focus-visible:border-ink',
        ].join(' ')}
      />
      <button
        type="button"
        onClick={onToggleShow}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        tabIndex={-1}
        className={[
          'absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center',
          'w-8 h-8 rounded text-muted hover:text-ink cursor-pointer transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {show ? <EyeOffGlyph /> : <EyeGlyph />}
      </button>
    </div>
  );
}

function EyeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 8s2.6-4.5 6.5-4.5S14.5 8 14.5 8 11.9 12.5 8 12.5 1.5 8 1.5 8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeOffGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5l11 9M3 8.5C4.2 6.6 6 4.5 8 4.5c1 0 1.9.3 2.7.7M12.7 6.5C13.6 7.3 14.3 8.2 14.5 8.5c-.6 1-2.5 4-6.5 4-.9 0-1.7-.2-2.4-.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 9.5a2 2 0 0 0 3-2.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
