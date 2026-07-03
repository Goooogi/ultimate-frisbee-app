'use client';

// Single source of truth for client-side auth state.
//
// - Wraps the app once (in root layout) so any client component can call
//   useAuth() and read { user, loading, signIn, signUp, signOut }.
// - Listens to Supabase's onAuthStateChange so sign-in/out anywhere in the
//   app updates the whole tree without a manual refresh.
// - Fetches the matching profile row whenever a user is set so consumers
//   (avatars, name pills) get the display name + initials without each
//   component running its own fetch.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import type { Profile, SessionUser } from './types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    options?: { displayName?: string; phone?: string; username?: string },
  ) => Promise<{ error?: string; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  /**
   * Sends a password-reset email via Supabase.
   *
   * ANTI-ENUMERATION: always resolves with {} on success regardless of
   * whether the email is registered — Supabase already doesn't error for
   * unknown addresses, and we swallow all non-transport errors here so the
   * caller always shows the same generic "if that email has an account…"
   * message. The only errors returned are genuine transport failures.
   *
   * redirectTo uses window.location.origin. Supabase validates this against
   * the dashboard Redirect-URLs allowlist, so an attacker cannot redirect
   * the recovery token to an external domain — the allowlist is the security
   * control (add ${SITE_URL}/reset-password there before deploying).
   */
  resetPassword: (email: string) => Promise<{ error?: string }>;
  /**
   * Updates the authenticated user's password. Called from /reset-password
   * after Supabase has established a PASSWORD_RECOVERY session from the link.
   * Returns {} on success or { error: message } on failure (Supabase gives
   * actionable messages like "Password should be at least 8 characters").
   */
  updatePassword: (newPassword: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthState | null>(null);

type Client = SupabaseClient<Database>;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Start true so the playbook can show a loading state and not flash the
  // sign-in modal before we've checked for an existing session.
  const [loading, setLoading] = useState(true);

  // The Supabase browser client (supabase-js, ~245 kB) is loaded lazily via a
  // dynamic import so it stays OUT of the root-layout bundle that every page
  // ships. `loadClient` caches the single instance in a ref and is shared by
  // the mount effect and every auth callback. Until it resolves, `loading`
  // stays true — identical to the prior behavior where getSession() was still
  // pending, so consumers see no difference.
  const clientRef = useRef<Client | null>(null);
  const loadClient = useCallback(async (): Promise<Client> => {
    if (clientRef.current) return clientRef.current;
    const { createClient } = await import('@/lib/supabase/client');
    clientRef.current = createClient();
    return clientRef.current;
  }, []);

  // Hydrate the existing session on mount + subscribe to changes.
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      const supabase = await loadClient();
      if (!mounted) return;

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);

      const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
        if (!mounted) return;
        setSession(next);
        setLoading(false);
      });
      unsubscribe = () => subscription.subscription.unsubscribe();
      if (!mounted) unsubscribe();
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [loadClient]);

  // Whenever the session user changes, fetch their profile row. We refetch
  // any time the user id flips so a fresh sign-up picks up the trigger-
  // created profile without a hard reload.
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = await loadClient();
      const { data } = await supabase
        .from('profiles')
        .select('id, email, display_name, username, avatar_url, phone, role')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      setProfile(data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, loadClient]);

  const signIn = useCallback<AuthState['signIn']>(async (email, password) => {
    const supabase = await loadClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Normalize all sign-in failures to a single generic message so the
    // response can't be used to enumerate registered emails.
    if (error) return { error: 'Incorrect email or password.' };
    return {};
  }, [loadClient]);

  const signUp = useCallback<AuthState['signUp']>(async (email, password, opts) => {
    const supabase = await loadClient();
    const meta: Record<string, string> = {};
    if (opts?.displayName) meta.display_name = opts.displayName;
    if (opts?.phone) meta.phone = opts.phone;
    if (opts?.username) meta.username = opts.username.toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: Object.keys(meta).length > 0 ? meta : undefined,
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/playbook` : undefined,
      },
    });
    if (error) return { error: error.message };
    // When email confirmation is on, Supabase returns a user but no session.
    const needsConfirmation = !data.session && !!data.user;
    return { needsConfirmation };
  }, [loadClient]);

  const signOut = useCallback(async () => {
    const supabase = await loadClient();
    await supabase.auth.signOut();
  }, [loadClient]);

  const resetPassword = useCallback<AuthState['resetPassword']>(async (email) => {
    const supabase = await loadClient();
    // redirectTo must be on the Supabase dashboard Redirect-URLs allowlist.
    // Using window.location.origin (not a hardcoded value) so it works across
    // environments (prod, staging, localhost) without code changes.
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    // ANTI-ENUMERATION: swallow all errors except genuine transport failures.
    // Supabase does not error when the email is unknown, but we also don't
    // want to surface any other distinguishing error to the caller. If there
    // is a real transport failure (network down, misconfigured SMTP) we pass
    // a generic message so the user knows something went wrong without
    // learning whether the email is registered.
    if (error) {
      // Only surface errors that indicate an actual send failure, never ones
      // that could reveal whether the email exists.
      const isTransportFailure =
        error.message.toLowerCase().includes('smtp') ||
        error.message.toLowerCase().includes('sending') ||
        error.message.toLowerCase().includes('network');
      if (isTransportFailure) {
        return { error: 'Could not send the reset email. Please try again.' };
      }
      // All other errors (unknown email, rate-limit hints, etc.) are silenced.
    }
    return {};
  }, [loadClient]);

  const updatePassword = useCallback<AuthState['updatePassword']>(async (newPassword) => {
    const supabase = await loadClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return {};
  }, [loadClient]);

  const value = useMemo<AuthState>(() => {
    const user: SessionUser | null = session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? '',
          name: profile?.display_name || session.user.email?.split('@')[0] || 'Player',
          initials: computeInitials(profile?.display_name || session.user.email || ''),
          isAdmin: profile?.role === 'admin',
          profile,
        }
      : null;
    return { user, loading, signIn, signUp, signOut, resetPassword, updatePassword };
  }, [session, profile, loading, signIn, signUp, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

function computeInitials(input: string): string {
  const cleaned = input.trim();
  if (!cleaned) return 'YO';
  // Strip the email domain if we were handed an email.
  const local = cleaned.includes('@') ? cleaned.split('@')[0] : cleaned;
  const parts = local.split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return local.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
