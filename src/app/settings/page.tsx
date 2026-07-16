import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth/auth-gate';
import { AppShell } from '@/components/page-shell';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { FavoritesSettings } from '@/components/settings/favorites-settings';
import { DeleteAccountSettings } from '@/components/settings/delete-account-settings';
import { FOR_YOU_ENABLED } from '@/lib/for-you/leagues';

export const metadata: Metadata = {
  title: 'Settings · The Layout',
  description: 'Manage your display name and @handle.',
};

export default function SettingsPage() {
  return (
    <AuthGate
      headline="Your account."
      subhead="Sign in to manage your display name and @handle."
    >
      <AppShell>
        <div className="px-5 pt-4 pb-12 lg:px-14 lg:pt-8 lg:pb-14 lg:max-w-[640px]">
          {/* Page header */}
          <div className="mb-6 lg:mb-8">
            <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent mb-2 font-sans">
              Account
            </div>
            <h1 className="m-0 font-display italic text-[36px] lg:text-[48px] font-bold tracking-[-0.02em] leading-[0.95] text-ink">
              Settings
            </h1>
            <p className="text-muted font-medium font-tight mt-2 text-[13px] lg:text-[15px]">
              Manage your public identity.
            </p>
          </div>

          {/* Settings cards */}
          <div className="flex flex-col gap-6">
            <ProfileSettings />
            {/* Favorites capture is gated behind the same FOR_YOU_ENABLED flag
                that hides the /for-you page + hamburger row + onboarding modal.
                Hidden while For You is unfinished (backlog #14); re-appears
                automatically when the flag flips to true. */}
            {FOR_YOU_ENABLED && <FavoritesSettings />}
            <DeleteAccountSettings />
          </div>
        </div>
      </AppShell>
    </AuthGate>
  );
}
