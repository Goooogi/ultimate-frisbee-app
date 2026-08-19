// /leagues — league directory landing page. The mobile bottom nav's "Leagues"
// tab points here instead of dumping straight into UFA scores: a home base
// listing every league with quick links into its Scores/Schedule/Teams/Players
// (or Events/Teams/Players for the event-scoped hubs).
//
// Fully static: no DB reads, no searchParams, no dynamic export needed — same
// treatment as /support, /terms, /privacy (plain server component, default
// static prerender).

import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { LeaguesDirectory } from '@/components/leagues/leagues-directory';

export const metadata: Metadata = {
  title: 'Leagues · The Layout',
  description: 'Every league in one place — UFA, USAU, WUL, PUL, WFDF, and EUCS.',
};

export default function LeaguesPage() {
  return (
    <PageShell
      eyebrow="The Layout"
      title="Leagues"
      breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Leagues' }]}
    >
      <LeaguesDirectory />
    </PageShell>
  );
}
