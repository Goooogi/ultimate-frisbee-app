// Post a jersey listing. Signed-in only — browsing is public, posting isn't.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { JerseyForm } from '@/components/jerseys/jersey-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'List a jersey · The Layout',
  robots: { index: false, follow: false },
};

export default async function NewJerseyPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/jerseys');

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title="List a jersey"
      subtitle="Goes live immediately. Only a title is required."
      breadcrumbs={[{ label: 'Jersey Exchange', href: '/jerseys' }, { label: 'New listing' }]}
    >
      <JerseyForm />
    </PageShell>
  );
}
