'use client';

// "Your Leagues" — client island on the Fantasy landing page.
//
// Signed out: compact CTA card explaining leagues, sign-in via AuthModal.
// Signed in: the user's leagues (getMyLeagues) + create/join affordances.
//
// This never touches the global UFA leaderboard below it — that stays a
// Server Component in page.tsx exactly as it was.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from '@/components/auth/auth-modal';
import { getMyLeagues, joinLeagueByCode, type MyLeagueRow } from '@/lib/fantasy/leagues';

interface YourLeaguesProps {
  /** The open-to-everyone pool (the original UFA beta), pinned above private
   *  leagues so it stays one tap away. Null when no global contest exists. */
  globalPool?: { name: string } | null;
  /** True when this is the whole page (/fantasy/leagues): the PageShell owns
   *  the title, so the section header is skipped and the New-league action
   *  renders in its own row. False (default) on the /fantasy hub, where the
   *  component renders as a titled section. */
  standalone?: boolean;
}

export function YourLeagues({ globalPool = null, standalone = false }: YourLeaguesProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);

  const [leagues, setLeagues] = useState<MyLeagueRow[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(true);

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadLeagues = useCallback(() => {
    if (!user) {
      setLeagues([]);
      setLeaguesLoading(false);
      return;
    }
    setLeaguesLoading(true);
    getMyLeagues()
      .then(setLeagues)
      .catch(() => setLeagues([]))
      .finally(() => setLeaguesLoading(false));
  }, [user]);

  useEffect(() => {
    loadLeagues();
  }, [loadLeagues]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setAuthOpen(true);
      return;
    }
    const code = joinCode.trim();
    if (!code) return;
    setJoining(true);
    setJoinError(null);
    try {
      const leagueId = await joinLeagueByCode(code);
      router.push(`/fantasy/leagues/${leagueId}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join with that code.');
    } finally {
      setJoining(false);
    }
  };

  // ── Loading (auth still hydrating) ──────────────────────────────────────
  if (loading) {
    return (
      <section aria-labelledby="your-leagues-heading" className="mb-8 lg:mb-10">
        {!standalone && <SectionHeader />}
        <div className="bg-surface rounded-card-lg shadow-card p-8">
          <div className="h-4 w-40 rounded-full bg-ink/[0.06] animate-pulse" />
        </div>
      </section>
    );
  }

  // ── Signed out ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <section aria-labelledby="your-leagues-heading" className="mb-8 lg:mb-10">
        {!standalone && <SectionHeader />}
        <div className="bg-surface rounded-card-lg shadow-card p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-8">
          <div className="flex-1">
            <h3 className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-2">
              Play with your friends.
            </h3>
            <p className="text-muted font-tight text-[13px] lg:text-[14px] leading-snug max-w-[440px]">
              Create a league, invite your friends, and pick your competitions —
              UFA, PUL, WUL seasons or USAU Nationals.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className={[
              'inline-flex items-center justify-center gap-2 flex-shrink-0',
              'px-6 py-3 rounded-full min-h-[44px]',
              'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.12em] uppercase',
              'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            ].join(' ')}
          >
            Sign in to start
          </button>
        </div>
        <AuthModal
          open={authOpen}
          dismissible
          initialMode="signin"
          onDismiss={() => setAuthOpen(false)}
          headline="Sign in to build a league"
          subhead="Create a league, invite your friends, and pick your competitions."
        />
      </section>
    );
  }

  // ── Signed in ────────────────────────────────────────────────────────────
  const newLeagueAction = (
    <Link
      href="/fantasy/leagues/new"
      className={[
        'inline-flex items-center gap-1.5',
        'px-4 py-2 rounded-full min-h-[36px]',
        'bg-accent text-accent-ink font-tight text-[11px] font-bold tracking-[0.1em] uppercase',
        'hover:opacity-90 transition-opacity duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
      ].join(' ')}
    >
      <PlusGlyph />
      New league
    </Link>
  );

  return (
    <section aria-labelledby="your-leagues-heading" className="mb-8 lg:mb-10">
      {standalone ? (
        <div className="flex justify-end mb-4">{newLeagueAction}</div>
      ) : (
        <SectionHeader action={newLeagueAction} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* League list */}
        <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
          {/* Pinned global pool — the original UFA beta, open to everyone.
              Links straight into the roster builder ("jump into it"). */}
          {globalPool && (
            <Link
              href="/fantasy/team"
              className={[
                'flex items-center gap-3 px-5 py-3.5',
                'no-underline transition-colors duration-150',
                'hover:bg-surface-hi border-b border-hairline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
              ].join(' ')}
            >
              <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="font-tight text-[14px] font-semibold text-ink truncate">
                  {globalPool.name}
                </span>
                <span className="font-tight text-[11px] text-muted">
                  Open to everyone — build your team
                </span>
              </span>
              <span className="flex-shrink-0 text-[9.5px] font-bold tracking-[0.1em] uppercase px-2 py-[3px] rounded-full bg-accent text-accent-ink">
                Beta
              </span>
              <ArrowGlyph />
            </Link>
          )}
          {leaguesLoading ? (
            <div className="p-5 flex flex-col gap-3" aria-hidden="true">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-11 rounded-card-sm bg-ink/[0.06] animate-pulse" />
              ))}
            </div>
          ) : leagues.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted font-tight text-[14px]">
                You&apos;re not in a league yet.
              </p>
              <Link
                href="/fantasy/leagues/new"
                className={[
                  'inline-flex items-center gap-1.5 mt-3',
                  'text-accent font-tight text-[13px] font-bold tracking-[0.04em]',
                  'hover:opacity-80 transition-opacity duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded',
                ].join(' ')}
              >
                Create your first league
                <ArrowGlyph />
              </Link>
            </div>
          ) : (
            <ul aria-label="Your leagues">
              {leagues.map((lg, idx) => (
                <li key={lg.leagueId}>
                  <Link
                    href={`/fantasy/leagues/${lg.leagueId}`}
                    className={[
                      'flex items-center gap-3 px-5 py-3.5',
                      'no-underline transition-colors duration-150',
                      'hover:bg-surface-hi',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
                      idx > 0 ? 'border-t border-hairline' : '',
                    ].join(' ')}
                  >
                    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span className="font-tight text-[14px] font-semibold text-ink truncate">
                        {lg.name}
                      </span>
                      <span className="font-tight text-[11px] text-muted">
                        {lg.memberCount} member{lg.memberCount !== 1 ? 's' : ''}
                      </span>
                    </span>
                    {lg.role === 'commissioner' && (
                      <span className="flex-shrink-0 text-[9.5px] font-bold tracking-[0.1em] uppercase px-2 py-[3px] rounded-full bg-accent/10 text-accent">
                        Commissioner
                      </span>
                    )}
                    <ArrowGlyph />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Join with a code */}
        <div className="bg-surface rounded-card-lg shadow-soft p-5">
          <div className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-3">
            Join with a code
          </div>
          <form onSubmit={handleJoin} className="flex flex-col gap-2.5">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setJoinError(null);
              }}
              placeholder="e.g. FR0STY9"
              maxLength={16}
              aria-label="League invite code"
              className={[
                'w-full px-3.5 py-2.5 rounded-card-sm bg-ink/5',
                'font-tight text-[14px] text-ink placeholder:text-faint tracking-[0.08em]',
                'focus:outline-none focus:ring-2 focus:ring-accent',
                'min-h-[44px]',
              ].join(' ')}
            />
            <button
              type="submit"
              disabled={joining || !joinCode.trim()}
              className={[
                'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full min-h-[44px]',
                'font-tight text-[12px] font-bold tracking-[0.06em] uppercase transition-colors duration-150',
                joining || !joinCode.trim()
                  ? 'bg-ink/[0.08] text-faint cursor-not-allowed'
                  : 'bg-ink/5 text-ink hover:bg-ink/10 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              ].join(' ')}
            >
              {joining ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-current/30 border-t-current animate-spin" aria-hidden="true" />
                  Joining…
                </>
              ) : (
                'Join league'
              )}
            </button>
            {joinError && (
              <p role="alert" className="text-[12px] text-live font-tight">
                {joinError}
              </p>
            )}
          </form>
        </div>
      </div>

      <AuthModal
        open={authOpen}
        dismissible
        initialMode="signin"
        onDismiss={() => setAuthOpen(false)}
        headline="Sign in to join a league"
      />
    </section>
  );
}

function SectionHeader({ action }: { action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4 lg:mb-5">
      <div>
        <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-2">
          Leagues
        </div>
        <h2
          id="your-leagues-heading"
          className="font-display italic text-[26px] lg:text-[34px] font-bold tracking-[-0.02em] leading-[0.95] text-ink"
        >
          Your Leagues
        </h2>
      </div>
      {action}
    </div>
  );
}

function PlusGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="flex-shrink-0 text-faint">
      <path
        d="M3 7h8M8 4l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
