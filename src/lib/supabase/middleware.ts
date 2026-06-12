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
