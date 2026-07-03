import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // NOTE: this file must live in `src/` (next to `app/`), not the repo root —
  // for a src/-based app Next.js ignores a root-level middleware.ts.
  //
  // Runs the Supabase session refresh ONLY on routes that read auth on the
  // server (or SSR user-specific content): admin, the auth-gated playbook +
  // settings, fantasy team management, and the password-recovery page. Every
  // other route is fully public and reads no session server-side, so there's
  // no reason to pay a getUser() round-trip there. The client-side AuthProvider
  // keeps tokens refreshed on all pages regardless, and each protected route
  // still enforces its own auth (assertAdmin / assertTeamEditor / client gate)
  // — this middleware is cookie refresh, not the access gate.
  matcher: [
    '/admin/:path*',
    '/playbook/:path*',
    '/settings/:path*',
    '/fantasy/:path*',
    '/reset-password/:path*',
  ],
};
