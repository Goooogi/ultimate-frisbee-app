'use client';

// Login / register modal for The Playbook.
//
// Sign-in mode: email + password.
// Sign-up mode: display name (optional), email, phone (optional, E.164),
//   password, confirm password — with a show/hide toggle for both password
//   fields so users can verify what they typed without retyping.
//
// Visual language matches CreatePlayDialog: dark scrim, single bg-bg card,
// uppercase tracked labels, accent button. The phone field accepts free
// input (parentheses, dashes, spaces) and we normalize to E.164 on submit
// before sending to Supabase, so the DB constraint never sees a malformed
// value coming from the UI.

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';

type Mode = 'signin' | 'signup';

interface AuthModalProps {
  open: boolean;
  initialMode?: Mode;
  dismissible?: boolean;
  onDismiss?: () => void;
  /** Optional headline override — the gate uses this to explain *why* you're
   *  being asked to sign in. */
  headline?: string;
  subhead?: string;
}

export function AuthModal({
  open,
  initialMode = 'signin',
  dismissible = false,
  onDismiss,
  headline,
  subhead,
}: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  // Reset on open + focus the email field.
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setPhone('');
    setShowPassword(false);
    setError(null);
    setInfo(null);
    setSubmitting(false);
    const t = setTimeout(() => emailRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, initialMode]);

  // Esc dismisses only when allowed.
  useEffect(() => {
    if (!open || !dismissible) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dismissible, onDismiss]);

  if (!open) return null;

  const isSignup = mode === 'signup';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setInfo(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Email is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (isSignup) {
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }

      // Phone is optional. When provided, normalize to E.164 (+15551234567)
      // before hitting Supabase so the DB CHECK constraint never sees a
      // formatted string like "(555) 123-4567".
      let normalizedPhone: string | undefined;
      const phoneInput = phone.trim();
      if (phoneInput) {
        const e164 = toE164(phoneInput);
        if (!e164) {
          setError('Phone must include country code (e.g. +1 555 123 4567).');
          return;
        }
        normalizedPhone = e164;
      }

      setSubmitting(true);
      const result = await signUp(trimmedEmail, password, {
        displayName: displayName.trim() || undefined,
        phone: normalizedPhone,
      });
      setSubmitting(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.needsConfirmation) {
        setInfo('Check your inbox to confirm your email, then sign in.');
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
      }
      // If session is returned immediately, the AuthProvider listener will
      // close the gate on its own — no further action needed here.
    } else {
      setSubmitting(true);
      const result = await signIn(trimmedEmail, password);
      setSubmitting(false);
      if (result.error) setError(result.error);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-ink/40 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onDismiss?.();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[440px] max-h-full overflow-y-auto bg-bg border border-border rounded-md shadow-xl flex flex-col"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex flex-col gap-2">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            The Playbook
          </span>
          <h2
            id="auth-modal-title"
            className="m-0 font-display italic font-bold text-[32px] leading-[0.95] tracking-[-0.03em] text-ink"
          >
            {headline ?? (isSignup ? 'Make it yours.' : 'Welcome back.')}
          </h2>
          <p className="text-[13px] text-muted font-tight leading-snug">
            {subhead ??
              (isSignup
                ? 'Create an account to save plays, swap teams, and pick up where you left off.'
                : 'Sign in to load your playbook and keep building from anywhere.')}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="px-6 pb-2">
          <div className="grid grid-cols-2 gap-0 bg-surface border border-border rounded-md overflow-hidden">
            <ModeButton active={!isSignup} onClick={() => setMode('signin')}>
              Sign in
            </ModeButton>
            <ModeButton active={isSignup} onClick={() => setMode('signup')}>
              Create account
            </ModeButton>
          </div>
        </div>

        {/* Fields */}
        <div className="px-6 py-4 flex flex-col gap-3.5">
          {isSignup && (
            <Field label="Display name" optional>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should we call you?"
                autoComplete="name"
                spellCheck={false}
                maxLength={60}
                className="bg-surface border border-border px-3 py-2.5 text-[14px] font-semibold text-ink font-tight rounded focus-visible:outline-none focus-visible:border-ink transition-colors"
              />
            </Field>
          )}

          <Field label="Email">
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              spellCheck={false}
              className="bg-surface border border-border px-3 py-2.5 text-[14px] font-semibold text-ink font-tight rounded focus-visible:outline-none focus-visible:border-ink transition-colors"
            />
          </Field>

          {isSignup && (
            <Field label="Phone" optional hint="Include country code">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                autoComplete="tel"
                inputMode="tel"
                spellCheck={false}
                maxLength={20}
                className="bg-surface border border-border px-3 py-2.5 text-[14px] font-semibold text-ink font-tight rounded focus-visible:outline-none focus-visible:border-ink transition-colors tabular"
              />
            </Field>
          )}

          <Field
            label="Password"
            hint={isSignup ? '8+ characters' : undefined}
          >
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder={isSignup ? 'Pick something strong' : 'Your password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
            />
          </Field>

          {isSignup && (
            <Field label="Confirm password">
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Type it again"
                autoComplete="new-password"
                show={showPassword}
                onToggleShow={() => setShowPassword((v) => !v)}
                mismatch={confirmPassword.length > 0 && confirmPassword !== password}
              />
            </Field>
          )}

          {error && (
            <div
              role="alert"
              className="text-[12px] font-medium font-tight text-live bg-live/10 border border-live/30 rounded px-3 py-2"
            >
              {error}
            </div>
          )}
          {info && !error && (
            <div
              role="status"
              className="text-[12px] font-medium font-tight text-ink bg-surface border border-border rounded px-3 py-2"
            >
              {info}
            </div>
          )}
        </div>

        {/* Footer / CTA */}
        <div className="px-6 pb-6 flex flex-col gap-3">
          <button
            type="submit"
            disabled={submitting}
            className={[
              'inline-flex items-center justify-center gap-2 w-full py-3 rounded-md cursor-pointer',
              'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase',
              'hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity',
              'disabled:opacity-60 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {submitting
              ? isSignup
                ? 'Creating account…'
                : 'Signing in…'
              : isSignup
                ? 'Create account'
                : 'Sign in'}
          </button>

          <p className="text-center text-[11px] text-faint font-tight">
            {isSignup ? 'Already have an account?' : "Don't have one yet?"}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? 'signin' : 'signup');
                setError(null);
                setInfo(null);
              }}
              className="text-ink font-semibold hover:text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </p>

          {dismissible && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-[10px] font-bold tracking-[0.16em] uppercase text-faint hover:text-ink font-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
            >
              Maybe later
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'py-2.5 text-[11px] font-bold tracking-[0.16em] uppercase font-tight transition-colors cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  hint,
  optional,
  children,
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
          {label}
          {optional && <span className="text-faint/70 ml-1.5 normal-case tracking-normal">· optional</span>}
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

// Password input with show/hide eye toggle. The toggle flips both the new
// and confirm fields at once (shared `show` state owned by the parent) so
// users only have to click once to verify both.
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  show,
  onToggleShow,
  mismatch,
}: {
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
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        minLength={8}
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

// Normalize a free-form phone input to E.164 (+ followed by digits only).
// Returns null when the result wouldn't match the DB CHECK constraint
// `^\+[1-9]\d{1,14}$`. We don't try to guess a country code — if the user
// typed bare digits with no leading "+" we reject, since assuming a default
// region is a mistake we'd regret.
function toE164(raw: string): string | null {
  const cleaned = raw.replace(/[\s().-]/g, '');
  if (!cleaned.startsWith('+')) return null;
  const digits = cleaned.slice(1);
  if (!/^[1-9]\d{1,14}$/.test(digits)) return null;
  return `+${digits}`;
}
