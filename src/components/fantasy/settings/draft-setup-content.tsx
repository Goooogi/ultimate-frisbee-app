'use client';

// Draft setup — commissioner-only content for /fantasy/l/[contestId]/draft/setup:
// the draft scheduling card plus auction player prices. Role, draft and
// readiness all load here with the user's session (readiness is a per-user
// RPC), and reload after every save.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { getMyLeagueRole, type ContestView, type LeagueRole } from '@/lib/fantasy/leagues';
import { getDraft, getDraftReadiness, type Draft, type DraftReadiness } from '@/lib/fantasy/draft-room';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { DraftSettingsCard } from './draft-settings-card';
import { PricesCard } from './prices-card';

const HEADING_CLASS =
  'font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink';

export function DraftSetupContent({ contest }: { contest: ContestView }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [role, setRole] = useState<LeagueRole | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [readiness, setReadiness] = useState<DraftReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, d, rd] = await Promise.all([
        getMyLeagueRole(contest.leagueId),
        getDraft(contest.id),
        getDraftReadiness(contest.id),
      ]);
      setRole(r);
      setDraft(d);
      setReadiness(rd);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the draft.');
    } finally {
      setLoading(false);
    }
  }, [contest.id, contest.leagueId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    load();
  }, [authLoading, user, load]);

  const onSaved = () => {
    revalidateFantasyLeague(contest.leagueId, contest.id).catch(() => null);
    router.refresh();
    load();
  };

  const heading = (
    <h2 id="draft-setup-heading" className={HEADING_CLASS}>
      Draft setup
    </h2>
  );

  if (authLoading || loading) {
    return (
      <section aria-labelledby="draft-setup-heading" className="space-y-4">
        {heading}
        <div className="bg-surface rounded-card-lg shadow-card p-6 flex items-center justify-center" aria-hidden="true">
          <span className="w-5 h-5 rounded-full border-2 border-ink/15 border-t-accent animate-spin" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section aria-labelledby="draft-setup-heading" className="space-y-4">
        {heading}
        <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
          <p role="alert" className="text-live font-tight text-[14px]">
            {error}
          </p>
        </div>
      </section>
    );
  }

  if (role !== 'commissioner') {
    return (
      <section aria-labelledby="draft-setup-heading" className="space-y-4">
        {heading}
        <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
          <p className="text-muted font-tight text-[14px]">Only the commissioner can set up the draft.</p>
        </div>
      </section>
    );
  }

  const showPrices = draft?.draftType === 'auction' && draft.status === 'scheduled';

  return (
    <section aria-labelledby="draft-setup-heading" className="space-y-4">
      {heading}
      <DraftSettingsCard contest={contest} draft={draft} readiness={readiness} loading={false} onSaved={onSaved} />
      {showPrices && draft && <PricesCard contest={contest} draft={draft} onSaved={onSaved} />}
    </section>
  );
}
