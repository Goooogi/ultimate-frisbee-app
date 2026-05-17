import type { Metadata } from 'next';
import { HubShell } from '@/components/hub-shell';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'Fantasy · The Layout',
  description: 'Draft your team and play UFA fantasy with friends. Coming soon.',
};

export default function FantasyPage() {
  return (
    <HubShell>
      <ComingSoon
        eyebrow="03 · Fantasy"
        title="Fantasy"
        blurb="Draft your roster from the real UFA, ride the live leaderboard during the season, and run a league with friends. Coming soon."
      />
    </HubShell>
  );
}
