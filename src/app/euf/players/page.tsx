// /euf/players — EUCS Players hub: career scoring leaderboard across every
// event, one row per NAME (euf_rosters ids are per-event, so the name is the
// only stable key — same reason the profile route is /by-name/[name]).

import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listTopPlayers } from '@/lib/euf/data';
import { EufPlayersHub } from '@/components/euf/euf-players-hub';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'EUCS Players · European Ultimate · The Layout',
  description:
    'Career scoring leaders across the European Ultimate Club Season — goals, assists, and points.',
};

export default async function EufPlayersPage() {
  const players = await listTopPlayers(300).catch(() => []);

  return (
    <PageShell
      title="EUCS Players"
      eyebrow="EUF · Club Season"
      subtitle="Career scoring leaders across every EUCS event. Search by name to open a profile."
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'EUCS', href: '/euf/events' },
        { label: 'Players' },
      ]}
    >
      {players.length === 0 ? (
        <div className="rounded-card-lg bg-surface shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">No players available yet.</p>
        </div>
      ) : (
        <EufPlayersHub players={players} />
      )}
    </PageShell>
  );
}
