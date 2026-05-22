import type { Metadata } from 'next';
import { PlaybookApp } from '@/components/playbook/playbook-app';
import { AuthGate } from '@/components/auth/auth-gate';

export const metadata: Metadata = {
  title: 'The Playbook · The Layout',
  description:
    'Diagram Ultimate Frisbee plays — pick a stack, position players, animate the motion step by step.',
};

export default function PlaybookPage() {
  return (
    <AuthGate
      headline="Pull up your playbook."
      subhead="Sign in to save plays, switch teams, and pick up exactly where you left off."
    >
      <PlaybookApp />
    </AuthGate>
  );
}
