// /reset-password — landing target for Supabase password-reset emails.
//
// The link Supabase sends contains a recovery token in the URL hash.
// The browser Supabase client (detectSessionInUrl: true by default) detects
// it on mount and fires a PASSWORD_RECOVERY auth event, establishing a
// short-lived recovery session. ResetPasswordClient listens for that session
// and shows the set-new-password form.
//
// This server component is intentionally minimal — all session-detection
// and form logic lives in the client component so the Supabase browser
// client can read the URL hash (not available server-side).

import type { Metadata } from 'next';
import { ResetPasswordClient } from './client';

export const metadata: Metadata = {
  title: 'Reset Password — The Playbook',
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
