// /fantasy/leagues/new — Create-league flow. Server shell, auth-gated client
// form. Accepts ?game= from the hub's Start a League rows to preseed the
// game picker (CreateLeagueForm validates it against live games itself).

import { PageShell } from '@/components/page-shell';
import { CreateLeagueForm } from '@/components/fantasy/create-league-form';
import type { Crumb } from '@/components/breadcrumbs';
import type { CompetitionId } from '@/lib/fantasy/competitions';

const BREADCRUMBS: Crumb[] = [
  { label: 'Fantasy', href: '/fantasy' },
  { label: 'New League' },
];

export default function NewLeaguePage({
  searchParams,
}: {
  searchParams: { game?: string };
}) {
  return (
    <PageShell
      title="New League"
      eyebrow="Fantasy · Leagues"
      subtitle="Name it, pick the game, then invite your friends."
      breadcrumbs={BREADCRUMBS}
      hideFooterMobile
    >
      <CreateLeagueForm initialGameId={searchParams.game as CompetitionId | undefined} />
    </PageShell>
  );
}
