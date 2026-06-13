// /pul/players → redirect to the canonical shared route /players?league=pul.
//
// PUL standardized on the shared ?league=pul routes so the games sub-nav keeps
// league context across Scores/Schedule/Teams/Players. This dedicated path is
// kept only as a redirect so old links/bookmarks still work.

import { redirect } from 'next/navigation';

export default function PulPlayersRedirect() {
  redirect('/players?league=pul');
}
