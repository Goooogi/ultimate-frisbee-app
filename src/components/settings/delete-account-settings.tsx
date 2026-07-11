'use client';

// Delete-account settings — the "danger zone" card + confirm modal.
//
// Deletion itself is done SERVER-SIDE by the `delete-account` Supabase Edge
// Function (it needs the service-role key to remove the auth user). This
// component only: (1) collects a password re-auth in a confirm modal, (2)
// invokes the function with the user's own access token, (3) on success signs
// out and sends the user home. Full data cascade (profile, favorites, fantasy
// team, playbook, uploads) is handled by the function + DB ON DELETE CASCADEs.
//
// The function's documented responses drive the UI copy:
//   200 { deleted: true }
//   401 { error: 'reauth_failed' | 'unauthenticated' }
//   400 { error: 'password_required' }
//   409 { error: 'ownership_transfer_required', teams: [{id,name}] }
//   429 { error: 'rate_limited' }

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-provider';

type Phase = 'idle' | 'submitting' | 'error';

interface OwnedTeam {
  id: string;
  name: string;
}

export function DeleteAccountSettings() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-surface rounded-card-lg shadow-card overflow-hidden ring-1 ring-inset ring-live/15">
      <div className="px-5 py-4 border-b border-hairline">
        <h2 className="m-0 font-tight text-[11px] font-bold tracking-[0.18em] uppercase text-live">
          Danger zone
        </h2>
        <p className="mt-1 text-[12px] text-faint font-tight leading-snug">
          Permanently delete your account and all associated data — your profile,
          favorites, fantasy team, and any playbooks you solely own. This cannot be
          undone.
        </p>
      </div>

      <div className="px-5 py-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={[
            'inline-flex items-center justify-center px-4 py-2.5 rounded-card-sm cursor-pointer',
            'text-[12px] font-bold tracking-[0.08em] uppercase font-tight',
            'bg-live/[0.08] text-live ring-1 ring-inset ring-live/25',
            'hover:bg-live/[0.14] transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live',
          ].join(' ')}
        >
          Delete account
        </button>
      </div>

      {open && <ConfirmDeleteModal onClose={() => setOpen(false)} />}
    </div>
  );
}

// ─── Confirm modal ──────────────────────────────────────────────────────────

function ConfirmDeleteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [blockedTeams, setBlockedTeams] = useState<OwnedTeam[] | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  // Focus the password field on open; close on Esc (unless mid-submit).
  useEffect(() => {
    const t = setTimeout(() => passwordRef.current?.focus(), 30);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase !== 'submitting') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, phase]);

  const handleDelete = useCallback(async () => {
    if (!password || phase === 'submitting') return;
    setPhase('submitting');
    setError(null);
    setBlockedTeams(null);

    const supabase = createClient();
    // The Edge Function reads the caller from their Bearer token; supabase-js
    // attaches the current session's access token to functions.invoke, and the
    // password re-auth is verified server-side. We never trust a client-sent id.
    const { data, error: invokeErr } = await supabase.functions.invoke('delete-account', {
      body: { password },
    });

    // On a 2xx, supabase-js returns the parsed JSON in `data`. On a non-2xx it
    // returns a FunctionsHttpError in `invokeErr` whose `.context` is the raw
    // Response — our structured error body lives there, so we read both.
    const payload = (data ?? null) as
      | { deleted?: boolean; error?: string; teams?: OwnedTeam[] }
      | null;

    let code = payload?.error ?? null;
    let teams = payload?.teams ?? null;
    if (invokeErr) {
      try {
        const ctx = (invokeErr as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          code = body?.error ?? code;
          teams = body?.teams ?? teams;
        }
      } catch {
        /* fall through to generic error below */
      }
    }

    if (payload?.deleted) {
      // Success — clear the session and go home (signed-out state).
      await signOut();
      router.replace('/');
      router.refresh();
      return;
    }

    // Map the function's documented error codes to human copy.
    setPhase('error');
    switch (code) {
      case 'reauth_failed':
        setError('That password is incorrect. Please try again.');
        break;
      case 'password_required':
        setError('Enter your password to confirm.');
        break;
      case 'rate_limited':
        setError('Too many attempts. Please wait a minute and try again.');
        break;
      case 'ownership_transfer_required':
        setBlockedTeams(teams ?? []);
        setError(null);
        break;
      case 'unauthenticated':
        setError('Your session expired. Please sign in again.');
        break;
      default:
        setError('Something went wrong. Please try again.');
    }
  }, [password, phase, signOut, router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-ink/40 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && phase !== 'submitting') onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleDelete();
        }}
        className="w-full max-w-[440px] max-h-full overflow-y-auto bg-surface rounded-card-lg shadow-hero flex flex-col"
      >
        <div className="px-5 py-4 border-b border-hairline">
          <h2
            id="delete-account-title"
            className="font-display italic text-[24px] font-bold tracking-[-0.02em] leading-[0.95] text-live m-0"
          >
            Delete account
          </h2>
          <p className="mt-2 text-[12.5px] text-muted font-tight leading-snug">
            This permanently deletes your account and all associated data. This
            action cannot be undone. Enter your password to confirm.
          </p>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          {/* Ownership-transfer block — the one non-generic failure worth its own copy. */}
          {blockedTeams && blockedTeams.length > 0 ? (
            <div className="px-4 py-3 rounded-card-sm bg-live/[0.08] text-[12.5px] text-ink font-tight leading-snug">
              <p className="m-0 font-bold text-live mb-1">Transfer team ownership first</p>
              <p className="m-0 text-muted">
                You own {blockedTeams.length === 1 ? 'a team' : 'teams'} with other
                members. Transfer ownership (or remove the other members) before
                deleting your account:
              </p>
              <ul className="mt-2 mb-0 pl-4 list-disc text-ink">
                {blockedTeams.map((t) => (
                  <li key={t.id} className="font-semibold">{t.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-faint font-tight">
                Password
              </span>
              <input
                ref={passwordRef}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (phase === 'error') {
                    setPhase('idle');
                    setError(null);
                  }
                }}
                disabled={phase === 'submitting'}
                className={[
                  'w-full bg-ink/5 px-3.5 py-2.5 text-[14px] font-semibold text-ink font-tight rounded-card-sm',
                  'ring-1 ring-inset ring-transparent',
                  'focus-visible:outline-none focus-visible:ring-live',
                  'disabled:opacity-60',
                ].join(' ')}
                placeholder="Your password"
              />
            </label>
          )}

          {error && (
            <p className="m-0 text-[12px] font-medium text-live font-tight">{error}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-hairline flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={phase === 'submitting'}
            className={[
              'px-4 py-2.5 rounded-card-sm cursor-pointer text-[12px] font-bold tracking-[0.08em] uppercase font-tight',
              'text-muted hover:text-ink transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'disabled:opacity-60',
            ].join(' ')}
          >
            Cancel
          </button>
          {/* Hide the destructive submit while an ownership block is showing —
              nothing to submit until they fix it. */}
          {!(blockedTeams && blockedTeams.length > 0) && (
            <button
              type="submit"
              disabled={!password || phase === 'submitting'}
              className={[
                'px-4 py-2.5 rounded-card-sm cursor-pointer text-[12px] font-bold tracking-[0.08em] uppercase font-tight',
                'bg-live text-white ring-1 ring-inset ring-live',
                'hover:opacity-90 transition-opacity duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              ].join(' ')}
            >
              {phase === 'submitting' ? 'Deleting…' : 'Delete forever'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
