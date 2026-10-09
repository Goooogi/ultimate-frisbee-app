// Fantasy — Draft setup. Commissioner-only page (Hunter, 2026-10-07: setting
// up the draft is its own page, not a Settings card). Renders inside the
// league layout (../../layout.tsx); the client island resolves the role and
// loads the draft + readiness with the user's session — fantasy_draft_readiness
// is a per-user read a server render can't make, which is why the old
// Settings card sat on "Loading…".

import { notFound } from 'next/navigation';
import { getContest } from '@/lib/fantasy/leagues';
import { DraftSetupContent } from '@/components/fantasy/settings/draft-setup-content';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function FantasyDraftSetupPage({ params }: { params: { contestId: string } }) {
  const contest = await getContest(params.contestId);
  if (!contest) notFound();

  return <DraftSetupContent contest={contest} />;
}
