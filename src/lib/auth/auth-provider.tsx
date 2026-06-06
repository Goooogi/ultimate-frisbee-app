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

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Profile, SessionUser } from './types';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (
    email: string,
    password: string,
    options?: { displayName?: string; phone?: string },
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  // Start true so the playbook can show a loading state and not flash the
  // sign-in modal before we've checked for an existing session.
  const [loading, setLoading] = useState(true);

  // Hydrate the existing session on mount + subscribe to changes.
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!mounted) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

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
    supabase
      .from('profiles')
      .select('id, email, display_name, username, avatar_url, phone, role')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id, supabase]);

  const signIn = useCallback<AuthState['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Normalize all sign-in failures to a single generic message so the
    // response can't be used to enumerate registered emails.
    if (error) return { error: 'Incorrect email or password.' };
    return {};
  }, [supabase]);

  const signUp = useCallback<AuthState['signUp']>(async (email, password, opts) => {
    const meta: Record<string, string> = {};
    if (opts?.displayName) meta.display_name = opts.displayName;
    if (opts?.phone) meta.phone = opts.phone;

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
  }, [supabase]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, [supabase]);

  const resetPassword = useCallback<AuthState['resetPassword']>(async (email) => {
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
  }, [supabase]);

  const updatePassword = useCallback<AuthState['updatePassword']>(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return {};
  }, [supabase]);

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
