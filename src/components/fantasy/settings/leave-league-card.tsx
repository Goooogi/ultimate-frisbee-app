'use client';

// Settings → Leave league (Hunter, 2026-10-09: moved here from the league
// page's Members section). Any member can leave. The owner can too once
// someone else is in the league: it passes to another member
// (fantasy_hand_off_league). A sole owner deletes the league instead.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { leaveLeague } from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';

export function LeaveLeagueCard({ leagueId, isOwner }: { leagueId: string; isOwner: boolean }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLeave = async () => {
    setLeaving(true);
    setError(null);
    try {
      await leaveLeague(leagueId);
      await revalidateFantasyLeague(leagueId).catch(() => null);
      router.push('/fantasy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave this league.');
      setLeaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-card-lg shadow-card p-5 lg:p-6">
      <h3 className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight mb-4">Leave league</h3>
      <div className="flex items-center justify-between gap-4">
        <p className="m-0 text-muted font-tight text-[13px]">
          {isOwner
            ? 'You’re the commissioner. The league passes to another member when you leave.'
            : 'You’ll lose access to this league’s contests and standings.'}
        </p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className={[
            'flex-shrink-0 inline-flex items-center justify-center px-4 py-2.5 rounded-full min-h-[44px]',
            'text-live hover:bg-live/10 transition-colors duration-150 cursor-pointer',
            'font-tight text-[11px] font-bold tracking-[0.08em] uppercase',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          ].join(' ')}
        >
          Leave league
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Leave this league?"
        body={
          isOwner
            ? 'The league passes to another member automatically — someone with a team first, then the longest-standing member. You’ll lose access to its contests and standings.'
            : "You'll lose access to its contests and standings. The commissioner can re-invite you later."
        }
        confirmLabel="Leave"
        busyLabel="Leaving…"
        busy={leaving}
        error={error}
        onConfirm={handleLeave}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
