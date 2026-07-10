import type { Metadata } from 'next';
import { AuthGate } from '@/components/auth/auth-gate';
import { AppShell } from '@/components/page-shell';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { FavoritesSettings } from '@/components/settings/favorites-settings';

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
            <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted mb-2 font-tight">
              Account
            </div>
            <h1 className="m-0 font-tight text-[36px] lg:text-[48px] font-bold tracking-[-0.04em] leading-none text-ink">
              Settings
            </h1>
            <p className="text-muted font-medium font-tight mt-2 text-[13px] lg:text-[15px]">
              Manage your public identity.
            </p>
          </div>

          {/* Settings cards */}
          <div className="flex flex-col gap-6">
            <ProfileSettings />
            <FavoritesSettings />
          </div>
        </div>
      </AppShell>
    </AuthGate>
  );
}
