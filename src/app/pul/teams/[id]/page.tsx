// /pul/teams/[id] — PUL team roster page.
// Shows the team header (logo + name) and a full stat table for all rostered players.
// Server component; gracefully handles empty/partial rosters (56 players across 13 teams).

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { PulTeamLogo } from '@/components/pul-team-logo';
import {
  getPulRoster,
  listPulTeams,
  type PulTeam,
  type PulPlayer,
} from '@/lib/pul/data';

export const revalidate = 3600;

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const teams = await listPulTeams().catch((): PulTeam[] => []);
  const team = teams.find((t) => t.id === params.id);
  if (!team) return { title: 'Team not found · The Layout' };
  return {
    title: `${team.city} ${team.mascot} · PUL · The Layout`,
    description: `${team.city} ${team.mascot} roster and stats for the 2026 PUL season.`,
  };
}

export default async function PulTeamPage({ params }: Props) {
  const [teams, roster] = await Promise.all([
    listPulTeams().catch((): PulTeam[] => []),
    getPulRoster(params.id, 2026).catch((): PulPlayer[] => []),
  ]);

  const team = teams.find((t) => t.id === params.id);

  // Unknown team id → hard 404
  if (!team) notFound();

  return (
    <PageShell
      title={`${team.city} ${team.mascot}`}
      eyebrow="PUL · Premier Ultimate League"
      topNavSlot={<span />}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'PUL Teams', href: '/pul/teams' },
        { label: `${team.city} ${team.mascot}` },
      ]}
    >
      {/* Team hero band */}
      <div className="flex items-center gap-5 mb-8 pb-6 border-b border-hairline">
        <PulTeamLogo team={team} size={72} />
        <div>
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-1">
            {team.city}
          </div>
          <h2 className="text-[28px] lg:text-[36px] font-bold font-tight text-ink leading-none tracking-[-0.02em]">
            {team.mascot}
          </h2>
          <div className="text-[12px] text-muted font-tight mt-1.5">
            2026 Season
          </div>
        </div>
      </div>

      {/* Roster */}
      <section aria-labelledby="roster-heading">
        <h2
          id="roster-heading"
          className="flex items-center justify-between text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight mb-3 pb-2 border-b border-hairline"
        >
          <span>Roster · 2026</span>
          <span className="text-faint tabular">{roster.length}</span>
        </h2>

        {roster.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-6 text-center bg-surface border border-border rounded-md">
            <p className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted font-tight">
              Roster coming soon
            </p>
            <p className="text-[13px] text-faint mt-2 max-w-sm">
              No players have been rostered for {team.city} {team.mascot} yet this season.
            </p>
            <Link
              href="/pul/teams"
              className="mt-5 text-[12px] font-bold tracking-[0.12em] uppercase text-ink underline underline-offset-2 hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
            >
              View all PUL teams
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  {[
                    { label: '#',      title: 'Jersey number',               left: true  },
                    { label: 'Player', title: 'Player name',                 left: true  },
                    { label: 'G',      title: 'Goals',                       left: false },
                    { label: 'A',      title: 'Assists',                     left: false },
                    { label: 'Blk',    title: 'Blocks',                      left: false },
                    { label: 'TO',     title: 'Turnovers',                   left: false },
                    { label: 'O-Pts',  title: 'Offensive Points Played',     left: false },
                    { label: 'D-Pts',  title: 'Defensive Points Played',     left: false },
                    { label: '+/−',    title: 'Plus / Minus',                left: false },
                  ].map((h) => (
                    <th
                      key={h.label}
                      scope="col"
                      title={h.title}
                      className={[
                        'px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase font-tight text-muted',
                        'border-b border-border whitespace-nowrap',
                        h.left ? 'text-left' : 'text-right',
                      ].join(' ')}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((player) => (
                  <RosterRow key={player.id} player={player} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

// ─── Roster row ───────────────────────────────────────────────────────────────

function RosterRow({ player }: { player: PulPlayer }) {
  return (
    <tr className="hover:bg-surface-hi transition-colors duration-100">
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-faint tabular font-tight">
        {player.jerseyNumber || '—'}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-left text-ink font-medium font-tight">
        {player.playerName}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.goals}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.assists}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.blocks}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.turnovers}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.oPoints}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {player.dPoints}
      </td>
      <td className="px-3 py-2.5 text-[13px] border-b border-hairline text-right tabular text-muted font-tight">
        {formatPlusMinus(player.plusMinus)}
      </td>
    </tr>
  );
}

function formatPlusMinus(val: number): string {
  if (val > 0) return `+${val}`;
  return String(val);
}
