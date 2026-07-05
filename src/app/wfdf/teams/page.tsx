// /wfdf/teams — WFDF Teams hub. Every team across all Worlds events, grouped by
// event with a live search. Event-scoped hub model (WFDF has no league feed).

import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listAllTeams } from '@/lib/wfdf/data';
import { WfdfTeamsHub } from '@/components/wfdf/wfdf-teams-hub';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'WFDF Teams · The Layout',
  description: 'Every WFDF World Championship team, grouped by event.',
};

export default async function WfdfTeamsPage() {
  const teams = await listAllTeams().catch(() => []);

  return (
    <PageShell
      title="WFDF Teams"
      eyebrow="WFDF · All Events"
      subtitle="National and club teams across every WFDF World Championship."
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'WFDF', href: '/wfdf/events' },
        { label: 'Teams' },
      ]}
    >
      <WfdfTeamsHub teams={teams} />
    </PageShell>
  );
}
