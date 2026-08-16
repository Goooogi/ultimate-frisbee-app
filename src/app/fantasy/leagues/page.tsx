// My Leagues — the "My Leagues" tab's landing page. Server Component shell.
//
// Shows every league the signed-in user belongs to (plus the pinned global
// UFA pool) and the create/join affordances; each league row dives into its
// league home → contests → rosters. Public to view the shell; the league list
// itself is session-driven inside the client island (signed-out users get the
// leagues CTA).

import { PageShell } from '@/components/page-shell';
import { fantasySeasonYear } from '@/lib/fantasy/data';
import { getGlobalContest } from '@/lib/fantasy/leagues';
import { YourLeagues } from '@/components/fantasy/your-leagues';

export const revalidate = 60;

export default async function MyLeaguesPage() {
  const globalContest = await getGlobalContest('ufa', fantasySeasonYear()).catch(() => null);

  return (
    <PageShell
      title="My Leagues"
      eyebrow="Fantasy · Beta"
      subtitle="Your leagues, their contests, and the global pool."
      hideFooterMobile
    >
      <YourLeagues
        standalone
        globalPool={
          globalContest ? { name: `UFA ${globalContest.seasonYear} · Global Pool` } : null
        }
      />
    </PageShell>
  );
}
