import type { Metadata } from 'next';
import { ManageTeams } from '@/components/playbook/manage-teams';

export const metadata: Metadata = {
  title: 'Teams · The Playbook',
  description: 'Manage your squads, invite players, and switch between teams.',
};

export default function PlaybookTeamsPage() {
  return <ManageTeams />;
}
