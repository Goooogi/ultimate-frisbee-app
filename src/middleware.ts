import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Crawler policy (2026-08-12 incident, see vault "Supabase Load Diagnosis
// 2026-08-11"): allowlist-only. Anything that identifies as a bot or scraping
// framework and is not in ALLOWED_BOTS gets 403 everywhere. Allowed bots still
// get 503 + Retry-After on the /players surfaces until the profile read path
// stops rebuilding inline — lift that block only after the async-rebuild fix
// is verified. Real browsers match neither test. robots.ts mirrors this policy.
const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|meta-external|python-requests|python-httpx|scrapy|go-http-client|java\/|libwww/i;
const ALLOWED_BOTS = /googlebot|bingbot/i;

export async function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? '';
  if (BOT_UA.test(ua)) {
    if (!ALLOWED_BOTS.test(ua)) {
      return new NextResponse('Forbidden', { status: 403 });
    }
    if (request.nextUrl.pathname.includes('/players')) {
      return new NextResponse('Crawling temporarily paused', {
        status: 503,
        headers: { 'Retry-After': '86400' },
      });
    }
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
