// /euf/clubs — the club index: 578 per-event team rows collapsed to 181 clubs.
//
// This is the league-wide entity view that /euf/teams/[id] can't be, since that
// route is one club at one event by construction.

import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { listClubs } from '@/lib/euf/data';
import { EufClubBrowse } from '@/components/euf/euf-club-browse';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'EUCS Clubs · European Ultimate · The Layout',
  description:
    'Every club in the European Ultimate Club Season, with event history, records, and finishes.',
};

export default async function EufClubsPage() {
  const clubs = await listClubs().catch(() => []);

  return (
    <PageShell
      title="EUCS Clubs"
      eyebrow="EUF · Club Season"
      subtitle="Every club across the European Ultimate Club Season."
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'EUCS', href: '/euf/events' },
        { label: 'Clubs' },
      ]}
    >
      {clubs.length === 0 ? (
        <div className="rounded-card-lg bg-surface shadow-card p-10 text-center">
          <p className="text-muted font-tight text-[14px]">No clubs available yet.</p>
        </div>
      ) : (
        <EufClubBrowse clubs={clubs} />
      )}
    </PageShell>
  );
}
