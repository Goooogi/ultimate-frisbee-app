import type { Metadata } from 'next';
import { ManageTeams } from '@/components/playbook/manage-teams';
import { AuthGate } from '@/components/auth/auth-gate';

export const metadata: Metadata = {
  title: 'Teams · The Playbook',
  description: 'Manage your squads, invite players, and switch between teams.',
};

export default function PlaybookTeamsPage() {
  return (
    <AuthGate
      headline="Manage your squads."
      subhead="Sign in to create teams, invite players, and switch between rosters."
    >
      <ManageTeams />
    </AuthGate>
  );
}
