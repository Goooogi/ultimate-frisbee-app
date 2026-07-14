// Unified admin portal — Content review + Feedback inbox as tabs so only the
// active section renders at a time (was a single long-scrolling page).
//
// Gated server-side: any non-admin (signed-out or signed-in user) hits
// notFound() so the route's existence isn't even surfaced to the public.
// We do NOT rely solely on the AccountChip hiding the link. RLS also limits
// both player_content (pending) and feedback (others' rows) to admins.

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPendingContent, getRecentReviewedContent } from '@/lib/player-content/server';
import { getAllFeedback } from '@/lib/feedback/server';
import { PageShell } from '@/components/page-shell';
import { AdminPortal, type AdminTab } from '@/components/admin/admin-tabs';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin · The Layout',
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) notFound();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') notFound();

  const [pending, recent, feedback] = await Promise.all([
    getPendingContent(),
    getRecentReviewedContent(25),
    getAllFeedback(200),
  ]);
  const newFeedback = feedback.filter((i) => i.status === 'new').length;
  const initialTab: AdminTab = searchParams.tab === 'feedback' ? 'feedback' : 'content';

  return (
    <PageShell
      eyebrow="Admin"
      title="Admin"
      subtitle="Review submitted content and read what users are telling us."
      topNavSlot={<span aria-hidden="true" />}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Admin' },
      ]}
    >
      <Suspense fallback={null}>
        <AdminPortal
          pending={pending}
          recent={recent}
          feedback={feedback}
          newFeedback={newFeedback}
          initialTab={initialTab}
        />
      </Suspense>
    </PageShell>
  );
}
