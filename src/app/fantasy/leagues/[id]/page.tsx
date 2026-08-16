// /fantasy/leagues/[id] — League home. Server-rendered public shell (league
// name, members, contests) + a client island for commissioner tools / member
// self-serve / new-contest. Public reads only — anon-safe, so this renders
// server-side for everyone; the client island resolves "am I a member" itself.

import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { getLeague, getLeagueMembers, getLeagueContests } from '@/lib/fantasy/leagues';
import { LeagueHomeClient } from '@/components/fantasy/league-home-client';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

const BREADCRUMBS: Crumb[] = [
  { label: 'Fantasy', href: '/fantasy' },
  { label: 'League' },
];

export default async function LeagueHomePage({ params }: { params: { id: string } }) {
  const league = await getLeague(params.id).catch(() => null);

  if (!league) {
    return (
      <PageShell title="League" eyebrow="Fantasy League" breadcrumbs={BREADCRUMBS} hideFooterMobile>
        <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">
            This league doesn&apos;t exist, or you don&apos;t have access to it.
          </p>
          <Link
            href="/fantasy"
            className="inline-flex items-center gap-1.5 mt-4 text-accent font-tight text-[13px] font-bold hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Back to Fantasy
          </Link>
        </div>
      </PageShell>
    );
  }

  const [members, contests] = await Promise.all([
    getLeagueMembers(params.id).catch(() => []),
    getLeagueContests(params.id).catch(() => []),
  ]);

  return (
    <PageShell
      title={league.name}
      eyebrow="Fantasy League"
      subtitle={`${league.memberCount} member${league.memberCount !== 1 ? 's' : ''} · ${league.contestCount} contest${league.contestCount !== 1 ? 's' : ''}`}
      breadcrumbs={[{ label: 'Fantasy', href: '/fantasy' }, { label: league.name }]}
      hideFooterMobile
    >
      <LeagueHomeClient league={league} members={members} contests={contests} />
    </PageShell>
  );
}
