// Jersey messages — inbox. Private: RLS returns only threads you're part of.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMyThreads } from '@/lib/jerseys/server';
import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { ThreadList } from '@/components/jerseys/thread-list';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Messages · Jersey Exchange',
  robots: { index: false, follow: false },
};

export default async function JerseyMessagesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/jerseys');

  const threads = await getMyThreads();

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title="Messages"
      breadcrumbs={[{ label: 'Jersey Exchange', href: '/jerseys' }, { label: 'Messages' }]}
    >
      <div className="flex flex-col gap-4">
        <ThreadList threads={threads} />
        <Link
          href="/jerseys/blocked"
          className="self-start text-[11.5px] font-semibold text-faint hover:text-ink font-tight underline underline-offset-4 motion-safe:transition-colors"
        >
          Manage blocked people
        </Link>
      </div>
    </PageShell>
  );
}
