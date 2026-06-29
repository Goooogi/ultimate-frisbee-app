// /wul/teams → redirect to the canonical shared route /teams?league=wul.
//
// WUL standardized on the shared ?league=wul routes (same pattern as PUL) so
// Teams works identically across leagues. Kept as a redirect so old links /
// bookmarks still work. Team detail still lives at /wul/teams/[id].

import { redirect } from 'next/navigation';

export default function WulTeamsRedirect() {
  redirect('/teams?league=wul');
}
