import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// EMERGENCY GATE (2026-08-12): crawler sweep of the player surfaces saturated
// the Micro DB instance (48k profile renders/hr at peak; see vault "Supabase
// Load Diagnosis 2026-08-11"). 503 + Retry-After tells well-behaved bots to
// back off without de-indexing; real browsers never match the UA test.
// Remove once the connections/profile render cost is fixed and verified.
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|meta-external/i;

export async function middleware(request: NextRequest) {
  if (
    BOT_UA.test(request.headers.get('user-agent') ?? '') &&
    request.nextUrl.pathname.includes('/players')
  ) {
    return new NextResponse('Crawling temporarily paused', {
      status: 503,
      headers: { 'Retry-After': '86400' },
    });
  }
  return await updateSession(request);
}

export const config = {
  // NOTE: this file must live in `src/` (next to `app/`), not the repo root —
  // for a src/-based app Next.js ignores a root-level middleware.ts.
  //
  // Runs the Supabase session refresh on EVERY page route (was: only the 5
  // auth-reading route groups). Rationale: iOS Safari force-expires JS-set
  // cookies after 7 days, so signed-in users who only browse public pages
  // (scores, teams…) were silently logged out on mobile within a week — the
  // server-set cookies this middleware produces are exempt from that cap.
  // updateSession() short-circuits before any network call when the request
  // has no auth cookie, so anonymous traffic pays nothing.
  //
  // Excluded: static assets/images (no session semantics) and /api (the UFA
  // proxy — latency-sensitive data fetches that never read the session).
  // Each protected route still enforces its own auth (assertAdmin /
  // assertTeamEditor / client gate) — this middleware is cookie refresh, not
  // the access gate.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|css|js|map)$).*)',
  ],
};
