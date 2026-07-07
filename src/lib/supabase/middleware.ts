import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasSupabaseEnv, supabaseUrl, supabaseAnonKey } from './env';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // No Supabase env configured (e.g. first deploy before vars are set) — skip
  // the session refresh rather than constructing a client against a placeholder
  // and making a doomed auth call on every request.
  if (!hasSupabaseEnv()) {
    return supabaseResponse;
  }

  // Anonymous request (no Supabase auth cookie) — nothing to refresh, skip the
  // auth round-trip entirely. This is what makes running this middleware on
  // EVERY route affordable: signed-out traffic (the vast majority) pays zero.
  //
  // Why every route matters: the browser client writes auth cookies via
  // document.cookie, and iOS Safari (ITP) force-expires JS-set cookies after
  // 7 DAYS. Cookies set via HTTP Set-Cookie response headers — which is what
  // this middleware produces when it refreshes the session — get their full
  // 400-day lifetime. Refreshing here on any page a signed-in user visits
  // keeps mobile-Safari sessions alive indefinitely instead of silently
  // logging users out within a week.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));
  if (!hasAuthCookie) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() must be called to refresh the session cookie.
  // Do not remove — without it, the session won't refresh on the server.
  await supabase.auth.getUser();

  return supabaseResponse;
}
