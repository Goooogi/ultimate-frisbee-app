'use client';

// Breadcrumb for the unified player profile that returns the visitor to the
// league list they came from (?from=pul → /players?league=pul, etc.).
//
// The param is read CLIENT-side (useSearchParams) so the profile page itself
// stays statically cacheable — reading searchParams in the server page would
// opt it into dynamic rendering and defeat the ISR layer that keeps crawler
// traffic off Postgres. The Suspense fallback renders the default crumb, so
// prerendered HTML always has a valid back link.

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Breadcrumbs, type Crumb } from '@/components/breadcrumbs';

// Map an originating-league code to its players-list URL. UFA is the root app,
// so it (and any unknown value) falls back to /players. All non-UFA leagues use
// the shared /players page with a ?league= filter.
export const PLAYERS_LIST_HREF: Record<string, string> = {
  ufa: '/players',
  usau: '/players?league=usau',
  pul: '/players?league=pul',
  wul: '/players?league=wul',
  wfdf: '/wfdf/players',
  euf: '/euf/players',
};

function FromAware({ crumbs }: { crumbs: Crumb[] }) {
  const from = useSearchParams().get('from');
  const href = (from && PLAYERS_LIST_HREF[from]) || '/players';
  const patched = crumbs.map((c) => (c.label === 'Players' ? { ...c, href } : c));
  return <Breadcrumbs crumbs={patched} />;
}

export function FromAwareCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <Suspense fallback={<Breadcrumbs crumbs={crumbs} />}>
      <FromAware crumbs={crumbs} />
    </Suspense>
  );
}

// Variant for sub-pages of the profile (The Thread): appends the current
// ?from= to the parent crumb's href so the chain back to the league list
// survives profile → thread → back, again without server-side searchParams.
function FromPreserving({ crumbs }: { crumbs: Crumb[] }) {
  const from = useSearchParams().get('from');
  const patched =
    from
      ? crumbs.map((c, i) =>
          i === crumbs.length - 2 && c.href
            ? { ...c, href: `${c.href}?from=${encodeURIComponent(from)}` }
            : c,
        )
      : crumbs;
  return <Breadcrumbs crumbs={patched} />;
}

export function FromPreservingCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <Suspense fallback={<Breadcrumbs crumbs={crumbs} />}>
      <FromPreserving crumbs={crumbs} />
    </Suspense>
  );
}
