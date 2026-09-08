'use client';

// Settings — commissioner-gated content for /fantasy/l/[contestId]/settings.
// Rendered inside the shared league layout (AppShell + header/nav already
// wrap this), so this owns ONLY the heading + cards, in mobile's order:
// Name → Logo → Teams/Limits → Format (weekly-stats only) → Roster → Draft →
// Player prices (auction + scheduled only) → Scoring.
//
// Gating: Public League contests (no leagueId) are service-managed — nothing
// to configure. Non-commissioners see a locked-out message. Role is resolved
// client-side (same pattern as league-home-client.tsx) since this is the
// commissioner-only screen and the RPCs re-check server-side regardless.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  getMyLeagueRole,
  type ContestView,
  type FantasyLeagueSummary,
  type LeagueRole,
} from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import type { Draft, DraftReadiness } from '@/lib/fantasy/draft-room';
import { LeagueLogo } from '@/components/fantasy/league-logo';
import { LeagueLogoPicker } from '@/components/fantasy/league-logo-picker';
import { NameCard, RosterCard, ScoringCard } from '@/components/fantasy/league-settings-panel';
import { LimitsCard } from './limits-card';
import { FormatCard } from './format-card';
import { WaiversCard } from './waivers-card';
import { DraftSettingsCard } from './draft-settings-card';
import { PricesCard } from './prices-card';

const HEADING_CLASS =
  'font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink';

interface Props {
  contest: ContestView;
  league: FantasyLeagueSummary | null;
  draft: Draft | null;
  readiness: DraftReadiness | null;
}

export function SettingsContent({ contest, league, draft, readiness }: Props) {
  const router = useRouter();
  const { user } = useAuth();

  const [myRole, setMyRole] = useState<LeagueRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(Boolean(contest.leagueId));
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);

  useEffect(() => {
    if (!contest.leagueId || !user) {
      setMyRole(null);
      setRoleLoading(false);
      return;
    }
    let cancelled = false;
    setRoleLoading(true);
    getMyLeagueRole(contest.leagueId)
      .then((r) => {
        if (!cancelled) setMyRole(r);
      })
      .catch(() => {
        if (!cancelled) setMyRole(null);
      })
      .finally(() => {
        if (!cancelled) setRoleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contest.leagueId, user]);

  const onSaved = () => {
    revalidateFantasyLeague(contest.leagueId ?? undefined, contest.id).catch(() => null);
    router.refresh();
  };

  if (!contest.leagueId) {
    return (
      <section aria-labelledby="league-settings-heading" className="space-y-4">
        <h2 id="league-settings-heading" className={HEADING_CLASS}>
          Settings
        </h2>
        <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
          <p className="text-muted font-tight text-[14px]">
            The Public League is service-managed — there&apos;s nothing to configure here.
          </p>
        </div>
      </section>
    );
  }

  if (roleLoading) {
    return (
      <section aria-labelledby="league-settings-heading" className="space-y-4">
        <h2 id="league-settings-heading" className={HEADING_CLASS}>
          Settings
        </h2>
      </section>
    );
  }

  if (myRole !== 'commissioner') {
    return (
      <section aria-labelledby="league-settings-heading" className="space-y-4">
        <h2 id="league-settings-heading" className={HEADING_CLASS}>
          Settings
        </h2>
        <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
          <p className="text-muted font-tight text-[14px]">Only the commissioner can change settings.</p>
        </div>
      </section>
    );
  }

  const leagueName = league?.name ?? contest.name;
  const showPrices = draft?.draftType === 'auction' && draft.status === 'scheduled';

  return (
    <section aria-labelledby="league-settings-heading" className="space-y-4">
      <h2 id="league-settings-heading" className={HEADING_CLASS}>
        Settings
      </h2>

      <NameCard leagueId={contest.leagueId} initialName={leagueName} />

      <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
        <h3 className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-4">Logo</h3>
        <div className="flex items-center gap-3.5">
          <LeagueLogo name={leagueName} logoUrl={league?.logoUrl} logoIcon={league?.logoIcon} size={56} />
          <div className="min-w-0 flex-1">
            <p className="font-tight text-[13.5px] font-semibold text-ink truncate">{leagueName}</p>
            <p className="font-tight text-[11.5px] text-faint">Shown across the app for this league.</p>
          </div>
          <button
            type="button"
            onClick={() => setLogoPickerOpen(true)}
            aria-label="Change league logo"
            className={[
              'flex-shrink-0 inline-flex items-center justify-center',
              'px-4 py-2 rounded-full min-h-[36px]',
              'font-tight text-[11px] font-bold tracking-[0.06em] uppercase',
              'bg-ink/5 text-ink hover:bg-ink/10 transition-colors duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            Change
          </button>
        </div>
      </div>

      <LimitsCard contest={contest} onSaved={onSaved} />

      {contest.settings.mode === 'weekly-stats' && <FormatCard contest={contest} onSaved={onSaved} />}

      {contest.settings.mode === 'weekly-stats' && <WaiversCard contest={contest} onSaved={onSaved} />}

      <RosterCard leagueId={contest.leagueId} contest={contest} />

      <DraftSettingsCard
        contest={contest}
        draft={draft}
        readiness={readiness}
        loading={false}
        onSaved={onSaved}
      />

      {showPrices && draft && <PricesCard contest={contest} draft={draft} onSaved={onSaved} />}

      <ScoringCard />

      <LeagueLogoPicker
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        leagueId={contest.leagueId}
        leagueName={leagueName}
        currentLogoUrl={league?.logoUrl ?? null}
        currentLogoIcon={league?.logoIcon ?? null}
      />
    </section>
  );
}
