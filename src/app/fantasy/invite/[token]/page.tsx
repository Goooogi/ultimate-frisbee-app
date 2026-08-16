import type { Metadata } from 'next';
import { LeagueInviteAcceptClient } from './client';

export const metadata: Metadata = {
  title: 'Accept invite · Fantasy',
};

export default function LeagueInviteAcceptPage({ params }: { params: { token: string } }) {
  return <LeagueInviteAcceptClient token={params.token} />;
}
