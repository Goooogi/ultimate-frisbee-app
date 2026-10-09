// /fantasy/leagues/new — Create a League. Server shell, auth-gated client form
// (create-only; joining is the hub's Join league button, Hunter 2026-10-07).
// Accepts ?game= from the hub's Start a League rows to preseed the game
// picker (CreateLeagueForm honours it only for a game that can start now).

import { PageShell } from '@/components/page-shell';
import { CreateLeagueForm } from '@/components/fantasy/create-league-form';
import type { Crumb } from '@/components/breadcrumbs';
import type { CompetitionId } from '@/lib/fantasy/competitions';
import { getGameStartDatesCached } from '@/lib/fantasy/game-dates-cached';

const BREADCRUMBS: Crumb[] = [
  { label: 'Fantasy', href: '/fantasy' },
  { label: 'Create a League' },
];

export default async function NewLeaguePage({
  searchParams,
}: {
  searchParams: { game?: string };
}) {
  // The hub's start data (cached — this page renders per request): which
  // games the picker enables, and the season/event each one starts against.
  const starts = await getGameStartDatesCached();
  return (
    <PageShell
      title="Create a League"
      eyebrow="Fantasy · Leagues"
      subtitle="Start a league and invite your friends."
      breadcrumbs={BREADCRUMBS}
      hideFooterMobile
      compactHeaderMobile
    >
      <CreateLeagueForm initialGameId={searchParams.game as CompetitionId | undefined} starts={starts} />
    </PageShell>
  );
}
