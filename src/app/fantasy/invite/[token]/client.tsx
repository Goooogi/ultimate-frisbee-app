'use client';

// League email-invite accept — mirrors src/app/playbook/invite/[token]/client.tsx
// structure exactly: preview → AuthGate → auto-run accept once → success/error.

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { useAuth } from '@/lib/auth/auth-provider';
import { previewLeagueInvite, acceptLeagueInvite } from '@/lib/fantasy/leagues';

export function LeagueInviteAcceptClient({ token }: { token: string }) {
  const [preview, setPreview] = useState<{ leagueName: string; email: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    previewLeagueInvite(token).then((res) => {
      if (!cancelled) setPreview(res);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AuthGate
      headline={preview ? `Join ${preview.leagueName}.` : "You've been invited."}
      subhead="Sign in or create an account with the same email the invite was sent to."
      initialEmail={preview?.email ?? undefined}
    >
      <Acceptor token={token} leagueName={preview?.leagueName ?? null} />
    </AuthGate>
  );
}

function Acceptor({ token, leagueName }: { token: string; leagueName: string | null }) {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [joinedLeagueId, setJoinedLeagueId] = useState<string | null>(null);

  // Guards against the double-fire a fresh signup's re-renders can cause —
  // same reasoning as playbook's autoRanRef (2nd call would hit an
  // already-accepted invite and surface a false error flash).
  const autoRanRef = useRef(false);

  const run = useCallback(async (manual = false) => {
    if (!manual) {
      if (autoRanRef.current) return;
      autoRanRef.current = true;
    }
    setState('pending');
    setError(null);
    try {
      const leagueId = await acceptLeagueInvite(token);
      setJoinedLeagueId(leagueId);
      setState('ok');
      setTimeout(() => router.push(`/fantasy/leagues/${leagueId}`), 1200);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : 'Something went wrong.'));
      setState('error');
      console.error('[fantasy-invite-accept] acceptLeagueInvite failed', err);
    }
  }, [token, router]);

  useEffect(() => {
    if (!user) return;
    run();
  }, [user, run]);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="flex items-center justify-between px-5 lg:px-12 py-5 border-b border-hairline">
        <Link
          href="/fantasy"
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted hover:text-ink no-underline font-tight"
        >
          ← Fantasy
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 py-12 lg:py-20">
        <div className="text-center flex flex-col items-center gap-5 max-w-[480px]">
          <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-accent font-tight">
            League invite
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
                Welcome to <span className="font-bold text-ink">{leagueName ?? 'the league'}</span>. Routing
                you there…
              </p>
            </>
          )}
          {state === 'error' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                Couldn&apos;t accept.
              </h1>
              <p className="text-[14px] text-muted font-tight max-w-[440px]">{error}</p>
              <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                <button
                  type="button"
                  onClick={() => run(true)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                >
                  Try again
                </button>
                <Link
                  href="/fantasy"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-ink/5 text-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase no-underline hover:bg-ink/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  Fantasy home
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
  if (r.includes('invite not found') || r.includes('not found')) {
    return 'This invite link is invalid or has been revoked.';
  }
  if (r.includes('already used') || r.includes('already accepted')) {
    return 'This invite has already been used.';
  }
  if (r.includes('expired')) return 'This invite has expired. Ask the commissioner to send a new one.';
  if (r.includes('different email')) {
    return 'This invite was sent to a different email address than the account you signed in with.';
  }
  if (r.includes('permission denied') || r.includes('not authenticated')) {
    return "We couldn't confirm your sign-in just yet. Tap “Try again.”";
  }
  return raw;
}
