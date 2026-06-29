// /wul/players → redirect to the canonical shared route /players?league=wul.
//
// WUL standardized on the shared ?league=wul route (same pattern as PUL) so the
// players directory works identically across leagues. This dedicated path is
// kept only as a redirect so old links/bookmarks still work. Any sort/dir/season
// query is preserved so bookmarked sorted links land on the same view.

import { redirect } from 'next/navigation';

interface Props {
  searchParams: { sort?: string; dir?: string; season?: string };
}

export default function WulPlayersRedirect({ searchParams }: Props) {
  const params = new URLSearchParams({ league: 'wul' });
  if (searchParams.sort) params.set('sort', searchParams.sort);
  if (searchParams.dir) params.set('dir', searchParams.dir);
  if (searchParams.season) params.set('season', searchParams.season);
  redirect(`/players?${params.toString()}`);
}
