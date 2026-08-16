'use client';

// Shareable join-code landing. The code itself can't be resolved to a league
// name client-side (it's column-locked, readable only via the commissioner
// RPC), so the copy stays generic — "Join league" rather than naming it.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/auth-gate';
import { joinLeagueByCode } from '@/lib/fantasy/leagues';

export function JoinByCodeClient({ code }: { code: string }) {
  return (
    <AuthGate
      headline="You've been invited to a league."
      subhead="Sign in or create an account to join."
    >
      <Joiner code={code} />
    </AuthGate>
  );
}

function Joiner({ code }: { code: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'joining' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setState('joining');
    setError(null);
    try {
      const leagueId = await joinLeagueByCode(code);
      router.push(`/fantasy/leagues/${leagueId}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? friendlyError(err.message)
          : 'Could not join this league. Please try again.',
      );
      setState('error');
    }
  };

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
          <h1 className="m-0 font-display italic font-bold text-[40px] lg:text-[52px] leading-[0.92] tracking-[-0.04em] text-ink">
            Join this league.
          </h1>
          <p className="text-[14px] text-muted font-tight max-w-[420px]">
            You&apos;ll be added as a member and can build a team for any of its contests.
          </p>

          <button
            type="button"
            onClick={handleJoin}
            disabled={state === 'joining'}
            className={[
              'inline-flex items-center justify-center gap-2 mt-3 px-6 py-3 rounded-full min-h-[44px]',
              'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.16em] uppercase',
              'hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              state === 'joining' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            {state === 'joining' && (
              <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" aria-hidden="true" />
            )}
            {state === 'joining' ? 'Joining…' : 'Join league'}
          </button>

          {state === 'error' && (
            <div className="flex flex-col items-center gap-3 mt-1">
              <p role="alert" className="text-[13px] text-live font-tight max-w-[400px]">
                {error}
              </p>
              <Link
                href="/fantasy"
                className="text-[11px] font-bold tracking-[0.16em] uppercase text-faint hover:text-ink no-underline transition-colors font-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full"
              >
                Back to Fantasy
              </Link>
            </div>
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
  return raw;
}
