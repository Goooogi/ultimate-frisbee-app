// /wul/teams — Western Ultimate League team grid.
// Each team card links to /wul/teams/[id] for the full roster.
// Server component; data comes from listWulTeams() (Supabase).

import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { WulTeamLogo } from '@/components/wul-team-logo';
import { listWulTeams, type WulTeam } from '@/lib/wul/data';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'WUL Teams · The Layout',
  description: 'The Western Ultimate League franchises — rosters and stats.',
};

export default async function WulTeamsPage() {
  const teams = await listWulTeams().catch((): WulTeam[] => []);

  return (
    <PageShell
      title="Teams"
      eyebrow="WUL · Western Ultimate League"
      topNavSlot={<span />}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {teams.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </div>
    </PageShell>
  );
}

// ─── Team card ────────────────────────────────────────────────────────────────

function TeamCard({ team }: { team: WulTeam }) {
  return (
    <Link
      href={`/wul/teams/${team.id}`}
      className={[
        'flex flex-col items-center gap-3 bg-surface border border-border p-4 rounded-md',
        'hover:border-ink transition-colors duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      ].join(' ')}
    >
      <WulTeamLogo team={team} size={56} />
      <div className="text-center min-w-0 w-full">
        <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-muted font-tight truncate">
          {team.city}
        </p>
        <p className="text-[15px] font-bold font-tight text-ink leading-tight truncate mt-0.5">
          {team.mascot}
        </p>
      </div>
    </Link>
  );
}
