// /pul/teams → redirect to the canonical shared route /teams?league=pul.
//
// PUL standardized on the shared ?league=pul routes so the games sub-nav keeps
// league context as you move between Scores/Schedule/Teams/Players. This
// dedicated path is kept only as a redirect so old links/bookmarks still work.
// (Team DETAIL pages remain at /pul/teams/[id].)

import { redirect } from 'next/navigation';

export default function PulTeamsRedirect() {
  redirect('/teams?league=pul');
}
