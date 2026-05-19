import type { Metadata } from 'next';
import { PlaybookApp } from '@/components/playbook/playbook-app';

export const metadata: Metadata = {
  title: 'The Playbook · The Layout',
  description:
    'Diagram Ultimate Frisbee plays — pick a stack, position players, animate the motion step by step.',
};

export default function PlaybookPage() {
  return <PlaybookApp />;
}
