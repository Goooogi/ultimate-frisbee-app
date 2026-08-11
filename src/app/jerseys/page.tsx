// Jersey marketplace — the board.
//
// PUBLIC: signed-out visitors can browse (RLS exposes active rows to anon), so
// a listing link shared to Instagram/Reddit opens to real content rather than a
// login wall. Signing in is required to POST or MESSAGE, not to look.

import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { listJerseyListings, listJerseyWants } from '@/lib/jerseys/server';
import { PageShell } from '@/components/page-shell';
import { JerseyBrowse } from '@/components/jerseys/jersey-browse';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Jersey Exchange · The Layout',
  description:
    'Trade, buy, and sell ultimate frisbee jerseys with the community. Search by team, player, or year and meet up at a tournament.',
};

export default async function JerseysPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const supabase = createClient();
  const [{ data: userData }, listings, wants] = await Promise.all([
    supabase.auth.getUser(),
    listJerseyListings(),
    listJerseyWants(),
  ]);

  return (
    <PageShell
      eyebrow="Community"
      title="Jersey Exchange"
      subtitle="Trade or sell jerseys with other players. Arrange the swap yourselves — we just connect you."
    >
      <JerseyBrowse
        listings={listings}
        wants={wants}
        signedIn={Boolean(userData.user)}
        initialTab={searchParams.tab === 'wants' ? 'wants' : 'listings'}
      />
    </PageShell>
  );
}
