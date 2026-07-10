// Admin moderation queue.
//
// Gated server-side: any non-admin (signed-out or signed-in user) hits
// notFound() so the route's existence isn't even surfaced to the public.
// We do NOT rely solely on the AccountChip hiding the link.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getPendingContent, getRecentReviewedContent } from '@/lib/player-content/server';
import { AdminContentQueue } from '@/components/admin/admin-content-queue';
import { PageShell } from '@/components/page-shell';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin · Content Review · The Layout',
  robots: { index: false, follow: false },
};

export default async function AdminContentPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) notFound();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') notFound();

  const [pending, recent] = await Promise.all([
    getPendingContent(),
    getRecentReviewedContent(25),
  ]);

  return (
    <PageShell
      eyebrow="Admin"
      title="Content review"
      subtitle="Approve or reject user-submitted photos and video before they appear on player profiles."
      topNavSlot={<span aria-hidden="true" />}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Admin' },
        { label: 'Content' },
      ]}
    >
      <div className="mb-6 flex flex-wrap gap-2 text-[11px] font-bold tracking-[0.16em] uppercase font-tight">
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink text-bg">
          {pending.length} pending
        </span>
        <Link
          href="#recent"
          className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink/5 text-muted hover:text-ink hover:bg-ink/10 transition-colors"
        >
          {recent.length} recent
        </Link>
      </div>

      <AdminContentQueue pending={pending} recent={recent} />
    </PageShell>
  );
}
