'use client';

// Shareable join-code landing — the link IS the acceptance. Once signed in
// (existing session, fresh signup, or OAuth return), the join runs on its own
// and routes straight into the league. fantasy_join_league is idempotent, so
// an existing member just gets routed in. The code itself can't be resolved
// to a league name client-side (it's column-locked, readable only via the
// commissioner RPC), so the copy stays generic.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { deferOnboardingUntilHome } from '@/components/favorites/favorites-onboarding-modal';
import { joinLeagueByCode, getLeagueContests } from '@/lib/fantasy/leagues';

export function JoinByCodeClient({ code }: { code: string }) {
  return (
    <AuthGate
      eyebrow="League invite"
      headline="You've been invited to a league."
      subhead="Sign in or create an account and you'll be dropped right into it."
    >
      <Joiner code={code} />
    </AuthGate>
  );
}

function Joiner({ code }: { code: string }) {
  // Signed in on the invite (Joiner only renders then): the favorites picker
  // waits for Home instead of landing on top of the league.
  useEffect(() => deferOnboardingUntilHome(), []);
  const router = useRouter();
  const [state, setState] = useState<'joining' | 'error'>('joining');
  const [error, setError] = useState<string | null>(null);

  // Same double-fire guard as the email-invite Acceptor — a fresh signup's
  // re-renders would otherwise run the join twice.
  const autoRanRef = useRef(false);

  const run = useCallback(async (manual = false) => {
    if (!manual) {
      if (autoRanRef.current) return;
      autoRanRef.current = true;
    }
    setState('joining');
    setError(null);
    try {
      const leagueId = await joinLeagueByCode(code);
      const contests = await getLeagueContests(leagueId).catch(() => []);
      // replace, not push — Back shouldn't land on this auto-joining page.
      router.replace(contests[0] ? `/fantasy/l/${contests[0].id}` : `/fantasy/leagues/${leagueId}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? friendlyError(err.message)
          : 'Could not join this league. Please try again.',
      );
      setState('error');
    }
  }, [code, router]);

  // Joiner only renders inside AuthGate once signed in.
  useEffect(() => {
    run();
  }, [run]);

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
          {state === 'joining' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                Joining…
              </h1>
              <p className="text-[14px] text-muted font-tight max-w-[420px]">
                Adding you to the league. Hang tight.
              </p>
            </>
          )}

          {state === 'error' && (
            <>
              <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
                Couldn&apos;t join.
              </h1>
              <p role="alert" className="text-[14px] text-muted font-tight max-w-[420px]">
                {error}
              </p>
              <div className="flex flex-col sm:flex-row gap-2.5 mt-3">
                <button
                  type="button"
                  onClick={() => run(true)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full min-h-[44px] bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer"
                >
                  Try again
                </button>
                <Link
                  href="/fantasy"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full min-h-[44px] bg-ink/5 text-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase no-underline hover:bg-ink/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
  if (r.includes('not found') || r.includes('invalid')) {
    return 'This invite link is invalid or has been rotated by the commissioner.';
  }
  if (r.includes('already') && r.includes('member')) {
    return "You're already a member of this league.";
  }
  if (r.includes('not authenticated')) {
    return "We couldn't confirm your sign-in just yet. Tap “Try again.”";
  }
  return raw;
}
