// /pul/teams — Premier Ultimate League teams.
// Server component; fetches from Supabase via the public data layer.
// Mirrors the WUL teams page structure and logo treatment.

import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { PulTeamLogo } from '@/components/pul-team-logo';
import { listPulTeams, type PulTeam } from '@/lib/pul/data';

export const metadata: Metadata = {
  title: 'PUL Teams · The Layout',
  description: 'The 13 Premier Ultimate League franchises for the 2026 season.',
};

export const revalidate = 3600;

export default async function PulTeamsPage() {
  const teams = await listPulTeams().catch((): PulTeam[] => []);

  return (
    <PageShell
      title="Teams"
      eyebrow="PUL · Premier Ultimate League"
      topNavSlot={<span />}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'PUL Teams' },
      ]}
    >
      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-surface border border-border rounded-md">
          <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted font-tight">
            Teams unavailable
          </p>
          <p className="text-[13px] text-faint mt-2 max-w-sm">
            Could not load PUL teams. Try refreshing the page.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

// ─── Team card ────────────────────────────────────────────────────────────────

function TeamCard({ team }: { team: PulTeam }) {
  return (
    <Link
      href={`/pul/teams/${team.id}`}
      className={[
        'flex flex-col items-center gap-3 bg-surface border border-border p-4 rounded-md',
        'text-ink no-underline',
        'hover:border-[rgb(var(--ink)/0.3)] hover:bg-surface-hi transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'group',
      ].join(' ')}
    >
      <PulTeamLogo team={team} size={56} />
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

