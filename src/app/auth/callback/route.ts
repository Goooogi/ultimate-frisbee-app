// OAuth (Google / Apple) PKCE callback.
//
// Supabase redirects here with a `?code=` after the provider authenticates the
// user. We exchange that code for a session (which sets the auth cookies via the
// SSR server client), then redirect to wherever the sign-in was initiated from.
// The landing path rides in the `oauth_next` cookie (set at sign-in) so the
// redirectTo we hand Supabase is a BARE url that exact-matches the dashboard
// Redirect-URLs allowlist — a `?next=` on redirectTo would need a wildcard entry
// and, on a miss, Supabase silently falls back to the Site URL (prod). On error
// we bounce to the home page with an `?auth_error` flag the UI can surface.
//
// SECURITY: `next` is validated to be a SAME-ORIGIN, path-only value so this
// route can't be turned into an open redirect. We DON'T rely on string-prefix
// checks (startsWith('/') etc.) — the URL parser that ultimately consumes the
// value normalizes backslashes to slashes and strips control chars (tab/CR/LF)
// AFTER such checks would run, so inputs like `/\evil.com` or `/%09/evil.com`
// slip past a naive check yet resolve off-origin. Instead we RESOLVE the value
// against a fixed private base and confirm the origin didn't change — testing
// the parser's actual behavior rather than trying to out-guess it.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const DEFAULT_NEXT = '/';
const VALIDATION_BASE = 'http://internal.invalid';

/** Return a safe same-origin path, or the default. Reject anything that, once
 *  parsed, escapes our origin — backslash/control-char tricks included. */
function safeNext(raw: string | null): string {
  if (!raw) return DEFAULT_NEXT;
  // Fast structural rejects: must be a rooted path, never protocol-relative,
  // and never contain a backslash (which the URL parser treats like a slash).
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return DEFAULT_NEXT;
  }
  // Authoritative check: resolve against a fixed private origin. If parsing the
  // path changes the origin, it escaped (control-char/normalization bypass).
  try {
    const resolved = new URL(raw, VALIDATION_BASE);
    if (resolved.origin !== VALIDATION_BASE) return DEFAULT_NEXT;
    // Re-serialize to the path only, dropping any parser-introduced origin and
    // preserving just pathname + search + hash.
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  // `next` is carried in the oauth_next cookie (set at sign-in) so redirectTo can
  // stay a bare URL that exact-matches the allowlist. Fall back to a ?next=
  // query param (older links) then the default. Sanitized either way.
  const cookieStore = cookies();
  const rawCookie = cookieStore.get('oauth_next')?.value;
  // The cookie value was encodeURIComponent'd when set; decode before validating.
  let cookieNext: string | null = null;
  if (rawCookie) {
    try {
      cookieNext = decodeURIComponent(rawCookie);
    } catch {
      cookieNext = null;
    }
  }
  const next = safeNext(cookieNext ?? url.searchParams.get('next'));
  // One-shot: clear the cookie so it can't affect a later request.
  cookieStore.delete('oauth_next');

  if (!code) {
    return NextResponse.redirect(new URL('/?auth_error=missing_code', url.origin));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL('/?auth_error=exchange_failed', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
