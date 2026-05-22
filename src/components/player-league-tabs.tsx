'use client';

// Player-profile league switcher.
//
// Player profiles are special: the UFA route uses a slug ("hmay") and the
// USAU route uses a UUID, and there's no shared identity layer linking
// them yet. So when the user clicks the "other" league tab, we can't just
// flip a ?league= query — we have to navigate to a different player URL
// entirely (or to /scores when no match exists).
//
// The Page component pre-computes `usauHref` and `ufaHref` server-side
// (using a name-match in our DB) and passes them in. Clicking the active
// league does nothing; clicking the inactive league navigates.

import { useRouter } from 'next/navigation';
import { LeagueTabs } from '@/components/league-tabs';
import type { LeagueId } from '@/lib/data';

interface Props {
  active: LeagueId;
  /** Where to go when the user clicks the UFA tab. Used when on a USAU profile. */
  ufaHref: string;
  /** Where to go when the user clicks the USAU tab. Used when on a UFA profile. */
  usauHref: string;
}

export function PlayerLeagueTabs({ active, ufaHref, usauHref }: Props) {
  const router = useRouter();
  function onChange(next: LeagueId) {
    if (next === active) return;
    if (next === 'ufa') router.push(ufaHref);
    else if (next === 'usau') router.push(usauHref);
  }
  return <LeagueTabs active={active} onChange={onChange} />;
}
