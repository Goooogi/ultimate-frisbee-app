import type { Metadata } from 'next';
import { HubShell } from '@/components/hub-shell';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = {
  title: 'The Playbook · The Layout',
  description: 'Diagram plays, share with your team, and study film. Coming soon.',
};

export default function PlaybookPage() {
  return (
    <HubShell>
      <ComingSoon
        eyebrow="02 · Playbook"
        title="The Playbook"
        blurb="A field for the rest of the field. Diagram plays on a live whiteboard, share sets with your team, and break down film. Building this next."
      />
    </HubShell>
  );
}
