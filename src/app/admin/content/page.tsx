// Unified admin page — Content review + Feedback inbox in one place.
//
// Gated server-side: any non-admin (signed-out or signed-in user) hits
// notFound() so the route's existence isn't even surfaced to the public.
// We do NOT rely solely on the AccountChip hiding the link. RLS also limits
// both player_content (pending) and feedback (others' rows) to admins.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getPendingContent, getRecentReviewedContent } from '@/lib/player-content/server';
import { getAllFeedback } from '@/lib/feedback/server';
import { AdminContentQueue } from '@/components/admin/admin-content-queue';
import { AdminFeedbackList } from '@/components/admin/admin-feedback-list';
import { PageShell } from '@/components/page-shell';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin · The Layout',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
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
      {/* ── Content review ──────────────────────────────────────────────── */}
      <section aria-labelledby="admin-content-heading">
        <h2
          id="admin-content-heading"
          className="text-[11px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-3"
        >
          Content review
        </h2>
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
      </section>

      {/* ── Feedback inbox ──────────────────────────────────────────────── */}
      <section aria-labelledby="admin-feedback-heading" className="mt-12 pt-10 border-t border-hairline">
        <h2
          id="admin-feedback-heading"
          className="text-[11px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-3"
        >
          Feedback inbox
        </h2>
        <div className="mb-6 flex flex-wrap gap-2 text-[11px] font-bold tracking-[0.16em] uppercase font-tight">
          <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink text-bg">
            {newFeedback} new
          </span>
          <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink/5 text-muted">
            {feedback.length} total
          </span>
        </div>
        <AdminFeedbackList items={feedback} />
      </section>
    </PageShell>
  );
}
