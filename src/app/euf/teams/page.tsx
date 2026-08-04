// /euf/teams → /euf/clubs
//
// EUF's league-wide team entity IS the club: euf_teams rows are per-EVENT, so a
// "teams" index would list the same club once per tournament. /euf/clubs merges
// them by (name, division). This alias exists because /euf/teams/[id] is a real
// route — without it the parent path 404s — and because "Teams" is the shared
// nav vocabulary across USAU/WFDF.

import { redirect } from 'next/navigation';

export default function EufTeamsIndexPage() {
  redirect('/euf/clubs');
}
