// /wfdf/players — WFDF Players hub. Search-first index of every named roster
// player across all Worlds events. Names link to /wfdf/players/by-name/[name],
// which resolves to the person's unified profile when they exist in an anchor
// league (USAU/UFA), else a WFDF-only career view.
//
// The roster corpus is ~21k rows, so the page ships only the cheap per-event
// totals; search runs server-side via the searchWfdfPlayers action.

import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listEventPlayerTotals } from '@/lib/wfdf/data';
import { WfdfPlayersHub } from '@/components/wfdf/wfdf-players-hub';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'WFDF Players · The Layout',
  description: 'Search named roster players across every WFDF World Championship.',
};

export default async function WfdfPlayersPage() {
  const eventTotals = await listEventPlayerTotals().catch(() => []);
  const totalPlayers = eventTotals.reduce((s, e) => s + e.playerCount, 0);

  return (
    <PageShell
      title="WFDF Players"
      eyebrow="WFDF · All Events"
      subtitle="Every named roster player across WFDF World Championships. Search by name to open a profile."
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'WFDF', href: '/wfdf/events' },
        { label: 'Players' },
      ]}
    >
      <WfdfPlayersHub eventTotals={eventTotals} totalPlayers={totalPlayers} />
    </PageShell>
  );
}
