// /fantasy/ufa/l/[id]/team — League-in-game roster builder page. Server shell
// resolves the contest (public read); the builder itself is a client
// component since it depends on session state (my team, my roster). Moved
// from /fantasy/contests/[id]/team for UFA contests (2026-08-27 game-hub IA
// inversion).

import { notFound } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getContest, getLeague } from '@/lib/fantasy/leagues';
import { ContestRosterBuilder } from '@/components/fantasy/contest-roster-builder';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function UfaLeagueInGameTeamPage({ params }: { params: { id: string } }) {
  const contest = await getContest(params.id).catch(() => null);

  if (!contest) {
    return (
      <PageShell
        title="Roster"
        eyebrow="UFA Fantasy"
        breadcrumbs={[{ label: 'UFA Fantasy', href: '/fantasy/ufa' }, { label: 'Roster' }]}
        hideFooterMobile
      >
        <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">
            This league doesn&apos;t exist, or you don&apos;t have access to it.
          </p>
        </div>
      </PageShell>
    );
  }

  if (contest.competition !== 'ufa') notFound();

  const league = contest.leagueId ? await getLeague(contest.leagueId).catch(() => null) : null;

  const breadcrumbs: Crumb[] = [
    { label: 'UFA Fantasy', href: '/fantasy/ufa' },
    ...(league ? [{ label: league.name, href: `/fantasy/leagues/${league.id}` }] : []),
    { label: contest.name, href: `/fantasy/ufa/l/${contest.id}` },
    { label: 'My Roster' },
  ];

  return (
    <PageShell
      title="My Roster"
      eyebrow={`${contest.competitionDef.shortLabel} · ${contest.seasonYear}`}
      subtitle={contest.name}
      breadcrumbs={breadcrumbs}
      hideFooterMobile
    >
      <ContestRosterBuilder contest={contest} />
    </PageShell>
  );
}
