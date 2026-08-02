// Edit a listing. Owner only — RLS enforces it too, but we gate here so a
// non-owner gets redirected rather than a form that silently fails to save.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getJerseyListing } from '@/lib/jerseys/server';
import { PageShell } from '@/components/page-shell';
import { JerseyForm } from '@/components/jerseys/jersey-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit listing · The Layout',
  robots: { index: false, follow: false },
};

export default async function EditJerseyPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: userData }, listing] = await Promise.all([
    supabase.auth.getUser(),
    getJerseyListing(params.id),
  ]);

  if (!listing) notFound();
  if (!userData.user) redirect('/jerseys');
  if (userData.user.id !== listing.ownerId) redirect(`/jerseys/${listing.id}`);

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title="Edit listing"
      breadcrumbs={[
        { label: 'Jersey Exchange', href: '/jerseys' },
        { label: listing.title, href: `/jerseys/${listing.id}` },
        { label: 'Edit' },
      ]}
    >
      <JerseyForm existing={listing} />
    </PageShell>
  );
}
