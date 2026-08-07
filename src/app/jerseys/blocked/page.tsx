// Manage who you've blocked on the Jersey Exchange.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyBlockedUsers } from '@/lib/jerseys/server';
import { PageShell } from '@/components/page-shell';
import { BlockedList } from '@/components/jerseys/blocked-list';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Blocked people · Jersey Exchange',
  robots: { index: false, follow: false },
};

export default async function BlockedPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/jerseys');

  const blocked = await getMyBlockedUsers();

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title="Blocked people"
      subtitle="They can’t message you or see your posts, and you won’t see theirs. They aren’t told."
      breadcrumbs={[{ label: 'Jersey Exchange', href: '/jerseys' }, { label: 'Blocked' }]}
    >
      <BlockedList blocked={blocked} />
    </PageShell>
  );
}
