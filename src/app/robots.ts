import type { MetadataRoute } from 'next';

// Crawler hygiene (see vault: Supabase Load Diagnosis 2026-08-11). The by-name
// player routes exist to resolve roster names → canonical /players/[id] pages;
// to a crawler they are thousands of long-tail duplicate URLs whose FIRST hit
// always misses the ISR cache and runs a name-resolution RPC (measured at
// 190/min of find_usau_player_by_name). Canonical content lives on /players —
// keep crawlers off the resolvers. /admin and /api are not crawlable content.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: ['/wfdf/players/by-name/', '/euf/players/by-name/', '/admin', '/api/'],
      },
    ],
  };
}
