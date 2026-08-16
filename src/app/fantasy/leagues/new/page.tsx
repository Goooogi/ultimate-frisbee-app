// /fantasy/leagues/new — Create-league flow. Server shell, auth-gated client form.

import { PageShell } from '@/components/page-shell';
import { CreateLeagueForm } from '@/components/fantasy/create-league-form';
import type { Crumb } from '@/components/breadcrumbs';

const BREADCRUMBS: Crumb[] = [
  { label: 'Fantasy', href: '/fantasy' },
  { label: 'New League' },
];

export default function NewLeaguePage() {
  return (
    <PageShell
      title="New League"
      eyebrow="Fantasy · Leagues"
      subtitle="Name your league — you can invite friends and add competitions next."
      breadcrumbs={BREADCRUMBS}
      hideFooterMobile
    >
      <CreateLeagueForm />
    </PageShell>
  );
}
