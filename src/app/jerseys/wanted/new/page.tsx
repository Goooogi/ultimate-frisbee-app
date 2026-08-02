// Post a "wanted" (ISO) jersey. Signed-in only.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { WantForm } from '@/components/jerseys/want-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Post a wanted jersey · The Layout',
  robots: { index: false, follow: false },
};

export default async function NewWantPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/jerseys');

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title="Post what you’re after"
      subtitle="Let people come to you when they have the jersey you want."
      breadcrumbs={[{ label: 'Jersey Exchange', href: '/jerseys' }, { label: 'Wanted' }]}
    >
      <WantForm />
    </PageShell>
  );
}
