// /wul/scores → redirect to the canonical shared route /scores?league=wul.
//
// WUL standardized on the shared ?league=wul routes (same pattern as PUL) so
// Scores works identically across leagues. Kept as a redirect so old links /
// bookmarks still work. Any season query is preserved.

import { redirect } from 'next/navigation';

interface Props {
  searchParams: { season?: string };
}

export default function WulScoresRedirect({ searchParams }: Props) {
  const params = new URLSearchParams({ league: 'wul' });
  if (searchParams.season) params.set('season', searchParams.season);
  redirect(`/scores?${params.toString()}`);
}
