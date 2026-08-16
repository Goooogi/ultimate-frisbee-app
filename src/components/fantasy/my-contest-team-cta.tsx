'use client';

// Contest page's "my team" CTA — client island. If the signed-in user already
// has a team in this contest, link to the roster page. Otherwise, a team-name
// input + createContestTeam (auth-gated via AuthModal on write attempt).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { AuthModal } from '@/components/auth/auth-modal';
import { getMyContestTeam, createContestTeam, type ContestView } from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';

export function MyContestTeamCta({ contest }: { contest: ContestView }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);

  const [myTeam, setMyTeam] = useState<{ id: string; teamName: string } | null>(null);
  const [teamLoading, setTeamLoading] = useState(true);

  const [teamName, setTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setMyTeam(null);
      setTeamLoading(false);
      return;
    }
    setTeamLoading(true);
    getMyContestTeam(contest.id)
      .then(setMyTeam)
      .catch(() => setMyTeam(null))
      .finally(() => setTeamLoading(false));
  }, [user, contest.id]);

  if (loading || teamLoading) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-6">
        <div className="h-11 w-48 rounded-card-sm bg-ink/[0.06] animate-pulse" />
      </div>
    );
  }

  if (myTeam) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-1">
            Your team
          </div>
          <div className="font-tight text-[16px] font-bold text-ink truncate">{myTeam.teamName}</div>
        </div>
        <Link
          href={`/fantasy/contests/${contest.id}/team`}
          className={[
            'flex-shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full min-h-[44px]',
            'bg-accent text-accent-ink font-tight text-[12px] font-bold tracking-[0.08em] uppercase',
            'hover:opacity-90 transition-opacity duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          ].join(' ')}
        >
          Manage roster
        </Link>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setAuthOpen(true);
      return;
    }
    const trimmed = teamName.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const teamId = await createContestTeam(contest.id, trimmed, contest.seasonYear);
      await revalidateFantasyLeague(contest.leagueId ?? undefined, contest.id).catch(() => null);
      setMyTeam({ id: teamId, teamName: trimmed });
      router.push(`/fantasy/contests/${contest.id}/team`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your team.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
      <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-faint font-tight mb-3">
        Build your team
      </div>
      <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Disc Jockeys"
          aria-label="Team name"
          className={[
            'flex-1 min-w-0 px-3.5 py-2.5 rounded-card-sm bg-ink/5',
            'font-tight text-[14px] text-ink placeholder:text-faint',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            'min-h-[44px]',
          ].join(' ')}
        />
        <button
          type="submit"
          disabled={creating || (!!user && !teamName.trim())}
          className={[
            'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full min-h-[44px] flex-shrink-0',
            'font-tight text-[12px] font-bold tracking-[0.08em] uppercase transition-all duration-150',
            creating || (!!user && !teamName.trim())
              ? 'bg-ink/[0.08] text-faint cursor-not-allowed'
              : 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          ].join(' ')}
        >
          {creating && (
            <span className="w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin" aria-hidden="true" />
          )}
          {!user ? 'Sign in to build' : creating ? 'Creating…' : 'Create team'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-[12px] text-live font-tight">
          {error}
        </p>
      )}

      <AuthModal
        open={authOpen}
        dismissible
        initialMode="signin"
        onDismiss={() => setAuthOpen(false)}
        headline="Sign in to build your team"
        subhead="Your roster is saved to your account."
      />
    </div>
  );
}
