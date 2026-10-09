'use client';

// Settings → Delete league. Owner-only (fantasy_delete_league re-checks).
// Deleting removes the league for every member, so the confirm asks for the
// league's name rather than a single tap.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PromptDialog } from '@/components/confirm-dialog';
import { deleteLeague } from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { Card } from './shared';

export function DeleteLeagueCard({
  leagueId,
  contestId,
  leagueName,
}: {
  leagueId: string;
  contestId: string;
  leagueName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async (typed: string) => {
    if (typed.trim() !== leagueName.trim()) {
      setError('Type the league name exactly to confirm.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteLeague(leagueId);
      // The league pages are ISR (revalidate 60) — drop them so it can't linger.
      await revalidateFantasyLeague(leagueId, contestId).catch(() => null);
      router.replace('/fantasy');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the league.');
      setBusy(false);
    }
  };

  return (
    <Card title="Delete league">
      <p className="font-tight text-[13px] text-muted leading-snug mb-4">
        Permanently deletes {leagueName} — every contest, team, roster, draft and chat — for all members. This
        can&apos;t be undone.
      </p>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={[
          'inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] rounded-card-sm cursor-pointer',
          'text-[12px] font-bold tracking-[0.08em] uppercase font-tight',
          'bg-live/[0.08] text-live ring-1 ring-inset ring-live/25',
          'hover:bg-live/[0.14] transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live',
        ].join(' ')}
      >
        Delete league
      </button>

      <PromptDialog
        open={open}
        title={`Delete ${leagueName}?`}
        body="Everyone in the league loses their team, roster and history. Type the league name to confirm."
        label="League name"
        placeholder={leagueName}
        confirmLabel={busy ? 'Deleting…' : 'Delete league'}
        busy={busy}
        error={error}
        onSubmit={confirm}
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
      />
    </Card>
  );
}
