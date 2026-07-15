// Resolves the public Supabase credentials, with build-safe fallbacks.
//
// Why fallbacks: NEXT_PUBLIC_* vars are inlined at BUILD time. When a page is
// statically prerendered during `next build` (e.g. on a fresh Vercel project,
// or a project transfer, before env vars are configured), the Supabase client
// constructor would otherwise throw "Your project's URL and API key are
// required" and fail the whole build. That makes it impossible to do the very
// first deploy you need in order to *add* the env vars.
//
// With placeholders, the constructor succeeds and prerender completes. No real
// network call happens at build time, so the placeholder is never used against
// Supabase. At runtime the real env vars are present and used normally. If they
// somehow aren't, calls fail at request time (handled by the app's error
// states) instead of hard-crashing the build — exactly the safe-fail we want.
//
// The placeholder URL is a syntactically valid https URL so createClient()'s
// internal URL parsing passes. The key is a non-empty dummy string.

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

/** True when the real public Supabase env vars are configured. */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
}

export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || PLACEHOLDER_KEY;
}

// ── OAuth provider feature flags ──────────────────────────────────────────────
// Each provider's button renders ONLY when its flag is 'true'. Off by default so
// the buttons don't ship (and error on click) before the provider is actually
// configured in the Supabase dashboard. Flip the flag once the provider works.
//   NEXT_PUBLIC_OAUTH_GOOGLE=true
//   NEXT_PUBLIC_OAUTH_APPLE=true
// NEXT_PUBLIC_* are inlined at build time, so these are safe to read in client
// components and are statically known.
export const OAUTH_GOOGLE_ENABLED = process.env.NEXT_PUBLIC_OAUTH_GOOGLE === 'true';
export const OAUTH_APPLE_ENABLED = process.env.NEXT_PUBLIC_OAUTH_APPLE === 'true';
