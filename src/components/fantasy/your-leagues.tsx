'use client';

// "Your Leagues" — client island on the Fantasy leagues page.
//
// Signed out: compact CTA card explaining leagues, sign-in via AuthModal.
// Signed in: three equal sibling cards — Your Leagues / Join a League /
// Create a League — the ESPN+Yahoo front-door pattern (their signup pages are
// three parallel actions, not a list with a form bolted to the side).
//
// Standings are NOT here and never were: they belong to a league, so they
// render on the league page you click into (2026-08-27 IA rework).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from '@/components/auth/auth-modal';
import { getMyLeagues, joinLeagueByCode, type MyLeagueRow } from '@/lib/fantasy/leagues';

interface YourLeaguesProps {
  /** The open-to-everyone Public League (the original UFA beta), pinned above
   *  private leagues so it stays one tap away. Carries its contest id so the
   *  row can link to the shared league page. Null when none exists. */
  globalPool?: { name: string; contestId: string } | null;
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
  return (
    <section aria-labelledby="your-leagues-heading" className="mb-8 lg:mb-10">
      {!standalone && <SectionHeader />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {/* ── Card 1: Your Leagues ──────────────────────────────────────── */}
        <div className="h-full bg-surface rounded-card-lg shadow-card overflow-hidden flex flex-col">
          <CardHeading
            title="Your Leagues"
            blurb="The leagues you're in. Tap one for standings, members and teams."
          />
          {/* Pinned Public League — the original UFA beta, open to everyone.
              Routes to its LEAGUE PAGE like every private league (option A,
              2026-08-27), not straight into the roster builder: standings and
              members belong on the league page, one code path for both kinds. */}
          {globalPool && (
            <Link
              href={`/fantasy/ufa/l/${globalPool.contestId}`}
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
                  Open to everyone — standings &amp; teams
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

        {/* ── Card 2: Join a League ─────────────────────────────────────── */}
        <div className="h-full bg-surface rounded-card-lg shadow-card p-5 lg:p-6 flex flex-col">
          <CardHeading
            title="Join a League"
            blurb="Got an invite code from a friend? Enter it here to join their league."
            bare
          />
          <form onSubmit={handleJoin} className="flex flex-col gap-2.5 mt-auto">
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

        {/* ── Card 3: Create a League ───────────────────────────────────── */}
        <div className="h-full bg-surface rounded-card-lg shadow-card p-5 lg:p-6 flex flex-col">
          <CardHeading
            title="Create a League"
            blurb="You're the commissioner here. Set it up, pick your games, and invite your friends."
            bare
          />
          <Link
            href="/fantasy/leagues/new"
            className={[
              'mt-auto inline-flex items-center justify-center gap-2',
              'px-4 py-2.5 rounded-full min-h-[44px]',
              'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.06em] uppercase',
              'no-underline hover:opacity-90 transition-opacity duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            ].join(' ')}
          >
            <PlusGlyph />
            Create a league
          </Link>
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

function SectionHeader() {
  return (
    <div className="mb-4 lg:mb-5">
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
  );
}

/** Each of the three cards leads with the same title+blurb block (the ESPN
 *  signup pattern). `bare` cards own their padding; the league-list card is
 *  edge-to-edge below the heading so its rows can span the full width. */
function CardHeading({ title, blurb, bare = false }: { title: string; blurb: string; bare?: boolean }) {
  return (
    <div className={bare ? 'mb-4' : 'px-5 pt-5 pb-4'}>
      <h3 className="font-display italic text-[19px] font-bold tracking-[-0.02em] leading-[1.05] text-ink mb-1.5">
        {title}
      </h3>
      <p className="text-muted font-tight text-[12.5px] leading-snug">{blurb}</p>
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
