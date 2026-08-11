// One wanted post. Public — a shared link opens to real content.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getJerseyWant, getMyBlockedIds } from '@/lib/jerseys/server';
import { jerseyTargetLine } from '@/lib/jerseys/types';
import { PageShell } from '@/components/page-shell';
import { WantDetail } from '@/components/jerseys/want-detail';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const want = await getJerseyWant(params.id);
  if (!want) return { title: 'Wanted · The Layout' };
  const target = jerseyTargetLine(want) ?? want.leagueName ?? 'Any jersey';
  return {
    title: `ISO ${target} · Jersey Exchange`,
    description: want.note?.slice(0, 150) ?? `Someone is looking for a ${target} jersey on The Layout.`,
  };
}

export default async function JerseyWantPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [{ data: userData }, want, blockedIds] = await Promise.all([
    supabase.auth.getUser(),
    getJerseyWant(params.id),
    getMyBlockedIds(),
  ]);

  if (!want) notFound();

  const target = jerseyTargetLine(want) ?? want.leagueName ?? 'Any jersey';

  return (
    <PageShell
      eyebrow="Jersey Exchange"
      title={`ISO ${target}`}
      breadcrumbs={[{ label: 'Jersey Exchange', href: '/jerseys' }, { label: target }]}
    >
      <WantDetail
        want={want}
        viewerId={userData.user?.id ?? null}
        posterBlocked={blockedIds.has(want.userId)}
      />
    </PageShell>
  );
}
