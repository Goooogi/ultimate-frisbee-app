'use client';

// Accept-invite landing page.
//
// Flow:
//   • Page renders the AuthGate. Signed-out users see the same sign-in
//     experience as the rest of the playbook — once they auth, the page
//     re-renders with a session and we run the accept RPC.
//   • Signed-in users see "Accepting…" → success or a labeled error. We
//     never auto-redirect on failure so the user can see what went wrong.

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { useAuth } from '@/lib/auth/auth-provider';
import { acceptInvite, previewInvite } from '@/lib/playbook/data';
import { formatSupabaseError } from '@/lib/supabase/errors';

export function InviteAcceptClient({ token }: { token: string }) {
  // Look up the email this invite was sent to so a new user's signup form is
  // prefilled (and AuthGate opens in create-account mode). null while loading
  // or for an invalid/expired token — the gate just won't prefill.
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    previewInvite(token).then((res) => {
      if (!cancelled) setInvitedEmail(res?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthGate
      headline="You've been invited."
      subhead="Sign in or create an account with the same email the invite was sent to."
      initialEmail={invitedEmail ?? undefined}
    >
      <Acceptor token={token} />
    </AuthGate>
  );
}

function Acceptor({ token }: { token: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>('');

  const run = useCallback(async () => {
    setState('pending');
    setError(null);
    try {
      const result = await acceptInvite(token);
      setTeamName(result.teamName);
      setState('ok');
      // Brief pause so the user sees confirmation, then route to teams.
      setTimeout(() => router.push('/playbook/teams'), 1200);
    } catch (err) {
      // The accept RPC's P0001 RAISE messages flow through formatSupabaseError
      // as-is; friendlyError below translates those into longer copy.
      const raw = formatSupabaseError(err);
      setError(friendlyError(raw));
      setState('error');
      console.error('[invite-accept] acceptInvite failed', err);
    }
  }, [token, router]);

  // Run the accept once we have a user.
  useEffect(() => {
    if (!user) return;
    run();
  }, [user, run]);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="flex items-center justify-between px-5 lg:px-12 py-5 border-b border-hairline">
        <Link href="/playbook" className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted hover:text-ink no-underline font-tight">
          ← The Playbook
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-12 lg:py-20">
        <div className="text-center flex flex-col items-center gap-5 max-w-[480px]">
          <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            Team invite
          </span>
          {state === 'pending' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                Joining…
              </h1>
              <p className="text-[14px] text-muted font-tight">
                Checking your invite. Hang tight.
              </p>
            </>
          )}
          {state === 'ok' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                You&apos;re in.
              </h1>
              <p className="text-[14px] text-muted font-tight">
                Welcome to <span className="font-bold text-ink">{teamName}</span>. Routing
                you to your teams…
              </p>
            </>
          )}
          {state === 'error' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                Couldn&apos;t accept.
              </h1>
              <p className="text-[14px] text-muted font-tight max-w-[440px]">
                {error}
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                <button
                  type="button"
                  onClick={run}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                >
                  Try again
                </button>
                <Link
                  href="/playbook/teams"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-surface border border-border text-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase no-underline hover:border-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  My teams
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function friendlyError(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes('invite not found')) return 'This invite link is invalid or has been revoked.';
  if (r.includes('already used')) return 'This invite has already been used.';
  if (r.includes('expired')) return 'This invite has expired. Ask the team owner to send a new one.';
  if (r.includes('different email')) {
    return 'This invite was sent to a different email address than the account you signed in with.';
  }
  // The "your session wasn't ready yet" class — don't show the raw Postgres text.
  if (r.includes('permission denied') || r.includes('not authenticated')) {
    return "We couldn't confirm your sign-in just yet. Tap “Try again.”";
  }
  return raw;
}
