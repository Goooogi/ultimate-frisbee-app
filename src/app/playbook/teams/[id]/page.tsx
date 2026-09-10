import type { Metadata } from 'next';
import { TeamDetail } from '@/components/playbook/team-detail';
import { AuthGate } from '@/components/auth/auth-gate';

export const metadata: Metadata = {
  title: 'Team · The Playbook',
  description: 'Members, roles, and invites for your team.',
};

export default function PlaybookTeamDetailPage({ params }: { params: { id: string } }) {
  return (
    <AuthGate
      headline="Manage your squad."
      subhead="Sign in to see members, send invites, and manage the team."
    >
      <TeamDetail teamID={params.id} />
    </AuthGate>
  );
}
