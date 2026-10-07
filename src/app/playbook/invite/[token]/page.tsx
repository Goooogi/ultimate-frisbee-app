import type { Metadata } from 'next';
import { InviteAcceptClient } from './client';

export const metadata: Metadata = {
  title: 'Accept invite · The Playbook',
  robots: { index: false, follow: false },
  referrer: 'same-origin',
};

export default function InviteAcceptPage({ params }: { params: { token: string } }) {
  return <InviteAcceptClient token={params.token} />;
}
