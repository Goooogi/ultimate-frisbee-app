// One jersey conversation. getThreadMessages() returns a null thread when the
// viewer isn't a participant (it resolves through their own thread list), so
// non-participants get a 404 rather than a leak.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getThreadMessages, getMyBlockedIds } from '@/lib/jerseys/server';
import { PageShell } from '@/components/page-shell';
import { ThreadView } from '@/components/jerseys/thread-view';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Conversation · Jersey Exchange',
  robots: { index: false, follow: false },
};

export default async function JerseyThreadPage({ params }: { params: { threadId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/jerseys');

  const [{ thread, messages }, blockedIds] = await Promise.all([
    getThreadMessages(params.threadId),
    getMyBlockedIds(),
  ]);
  if (!thread) notFound();

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title={thread.otherParty?.displayName ?? 'Conversation'}
      breadcrumbs={[
        { label: 'Jersey Exchange', href: '/jerseys' },
        { label: 'Messages', href: '/jerseys/messages' },
        { label: thread.otherParty?.displayName ?? 'Conversation' },
      ]}
    >
      <ThreadView
        thread={thread}
        initialMessages={messages}
        otherBlocked={thread.otherParty ? blockedIds.has(thread.otherParty.id) : false}
      />
    </PageShell>
  );
}
