// One jersey listing. Public — a shared link opens to real content.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getJerseyListing, getMyBlockedIds } from '@/lib/jerseys/server';
import { jerseyTargetLine } from '@/lib/jerseys/types';
import { PageShell } from '@/components/page-shell';
import { JerseyDetail } from '@/components/jerseys/jersey-detail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const listing = await getJerseyListing(params.id);
  if (!listing) return { title: 'Jersey · The Layout' };
  const target = jerseyTargetLine(listing);
  return {
    title: `${listing.title} · Jersey Exchange`,
    description: target
      ? `${target} — available to ${listing.kind === 'sell' ? 'buy' : 'trade'} on The Layout.`
      : listing.description?.slice(0, 150) ?? undefined,
  };
}

export default async function JerseyListingPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: userData }, listing, blockedIds] = await Promise.all([
    supabase.auth.getUser(),
    getJerseyListing(params.id),
    getMyBlockedIds(),
  ]);

  if (!listing) notFound();

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title={listing.title}
      breadcrumbs={[
        { label: 'Jersey Exchange', href: '/jerseys' },
        { label: listing.title },
      ]}
    >
      <JerseyDetail
        listing={listing}
        viewerId={userData.user?.id ?? null}
        ownerBlocked={blockedIds.has(listing.ownerId)}
      />
    </PageShell>
  );
}
