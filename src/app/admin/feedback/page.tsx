// Admin feedback inbox.
//
// Gated server-side: any non-admin (signed-out or signed-in) hits notFound()
// so the route's existence isn't surfaced. Mirrors /admin/content exactly — we
// do NOT rely solely on the AccountChip hiding the link. RLS also limits the
// feedback table to admins, so this is defence in depth.

import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAllFeedback } from '@/lib/feedback/server';
import { AdminFeedbackList } from '@/components/admin/admin-feedback-list';
import { PageShell } from '@/components/page-shell';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin · Feedback · The Layout',
  robots: { index: false, follow: false },
};

export default async function AdminFeedbackPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) notFound();
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') notFound();

  const items = await getAllFeedback(200);
  const newCount = items.filter((i) => i.status === 'new').length;

  return (
    <PageShell
      eyebrow="Admin"
      title="Feedback"
      subtitle="What users are telling us. Mark items read or resolved as you triage."
      topNavSlot={<span aria-hidden="true" />}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'Admin' },
        { label: 'Feedback' },
      ]}
    >
      <div className="mb-6 flex flex-wrap gap-2 text-[11px] font-bold tracking-[0.16em] uppercase font-tight">
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink text-bg">
          {newCount} new
        </span>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink/5 text-muted">
          {items.length} total
        </span>
      </div>

      <AdminFeedbackList items={items} />
    </PageShell>
  );
}
