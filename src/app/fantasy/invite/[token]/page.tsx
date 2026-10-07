import type { Metadata } from 'next';
import { LeagueInviteAcceptClient } from './client';

export const metadata: Metadata = {
  title: 'Accept invite · Fantasy',
  robots: { index: false, follow: false },
  referrer: 'same-origin',
};

export default function LeagueInviteAcceptPage({ params }: { params: { token: string } }) {
  return <LeagueInviteAcceptClient token={params.token} />;
}
