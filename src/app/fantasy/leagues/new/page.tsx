// /fantasy/leagues/new — Create-or-join flow. Server shell, auth-gated client
// forms (create + join by invite code), sized to fit one phone screen.
// Accepts ?game= from the hub's Start a League rows to preseed the game
// picker (CreateLeagueForm validates it against live games itself).

import { PageShell } from '@/components/page-shell';
import { CreateLeagueForm } from '@/components/fantasy/create-league-form';
import type { Crumb } from '@/components/breadcrumbs';
import type { CompetitionId } from '@/lib/fantasy/competitions';

const BREADCRUMBS: Crumb[] = [
  { label: 'Fantasy', href: '/fantasy' },
  { label: 'Create or Join' },
];

export default function NewLeaguePage({
  searchParams,
}: {
  searchParams: { game?: string };
}) {
  return (
    <PageShell
      title="Create or Join"
      eyebrow="Fantasy · Leagues"
      subtitle="Start a league for your friends, or join one with an invite code."
      breadcrumbs={BREADCRUMBS}
      hideFooterMobile
      compactHeaderMobile
    >
      <CreateLeagueForm initialGameId={searchParams.game as CompetitionId | undefined} />
    </PageShell>
  );
}
