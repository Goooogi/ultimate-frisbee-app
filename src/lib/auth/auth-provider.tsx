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
      .select('id, email, display_name, username, avatar_url, phone')
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

  const value = useMemo<AuthState>(() => {
    const user: SessionUser | null = session?.user
      ? {
          id: session.user.id,
          email: session.user.email ?? '',
          name: profile?.display_name || session.user.email?.split('@')[0] || 'Player',
          initials: computeInitials(profile?.display_name || session.user.email || ''),
          profile,
        }
      : null;
    return { user, loading, signIn, signUp, signOut };
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
