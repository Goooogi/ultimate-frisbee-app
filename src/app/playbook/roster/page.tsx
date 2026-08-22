import type { Metadata } from 'next';
import { TeamRoster } from '@/components/playbook/team-roster';
import { AuthGate } from '@/components/auth/auth-gate';

export const metadata: Metadata = {
  title: 'Team · The Playbook',
  description: 'Build your roster, set jersey numbers, and manage who plays.',
};

export default function PlaybookRosterPage() {
  return (
    <AuthGate
      headline="Build your roster."
      subhead="Sign in to add players, set numbers, and manage your squad."
    >
      <TeamRoster />
    </AuthGate>
  );
}
