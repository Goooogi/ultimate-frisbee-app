// Edit a wanted post. Owner only — RLS enforces it too, but we gate here so a
// non-owner gets redirected rather than a form that silently fails to save.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getJerseyWant } from '@/lib/jerseys/server';
import { jerseyTargetLine } from '@/lib/jerseys/types';
import { PageShell } from '@/components/page-shell';
import { WantForm } from '@/components/jerseys/want-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Edit wanted post · The Layout',
  robots: { index: false, follow: false },
};

export default async function EditJerseyWantPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: userData }, want] = await Promise.all([
    supabase.auth.getUser(),
    getJerseyWant(params.id),
  ]);

  if (!want) notFound();
  if (!userData.user) redirect('/jerseys');
  if (userData.user.id !== want.userId) redirect(`/jerseys/wanted/${want.id}`);

  const target = jerseyTargetLine(want) ?? want.leagueName ?? 'Any jersey';

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title="Edit wanted post"
      breadcrumbs={[
        { label: 'Jersey Exchange', href: '/jerseys' },
        { label: target, href: `/jerseys/wanted/${want.id}` },
        { label: 'Edit' },
      ]}
    >
      <WantForm existing={want} />
    </PageShell>
  );
}
