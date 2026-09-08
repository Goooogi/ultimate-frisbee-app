'use client';

// WaiversPanel — the Waivers route body. "My claims" (pending, then
// won/lost/cancelled history with a status pill) followed by "On waivers"
// (every listed player with a clear time; click opens WaiverClaimDialog when
// I have a team). Web port of the mobile app's WaiversScreen.tsx
// (altiusapps/mobileapp-thelayout ·
// src/components/fantasy/waivers/WaiversScreen.tsx).

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  getWaiverPlayers,
  getWaiverClaims,
  getMyContestTeam,
  cancelWaiverClaim,
  waiverSettings,
  type ContestView,
  type WaiverClaim,
  type WaiverClaimStatus,
  type WaiverPlayer,
} from '@/lib/fantasy/leagues';
import { WaiverClaimDialog } from './waiver-claim-dialog';

function statusClasses(status: WaiverClaimStatus): string {
  if (status === 'pending') return 'bg-accent/15 text-accent';
  if (status === 'won') return 'bg-ink text-surface';
  return 'bg-ink/8 text-muted';
}

function statusLabel(status: WaiverClaimStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'won':
      return 'Won';
    case 'lost':
      return 'Lost';
    case 'voided':
      return 'Voided';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function WaiversPanel({ contest }: { contest: ContestView }) {
  const { user } = useAuth();

  const [waiverPlayers, setWaiverPlayers] = useState<WaiverPlayer[]>([]);
  const [claims, setClaims] = useState<WaiverClaim[]>([]);
  const [myTeam, setMyTeam] = useState<{ id: string; teamName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { hours } = waiverSettings(contest.settings);

  const refresh = async () => {
    const [wp, c] = await Promise.all([
      getWaiverPlayers(contest.id).catch(() => []),
      getWaiverClaims(contest.id).catch(() => []),
    ]);
    setWaiverPlayers(wp);
    setClaims(c);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getWaiverPlayers(contest.id).catch(() => []), getWaiverClaims(contest.id).catch(() => [])]).then(
      ([wp, c]) => {
        if (cancelled) return;
        setWaiverPlayers(wp);
        setClaims(c);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [contest.id]);

  useEffect(() => {
    if (!user) {
      setMyTeam(null);
      return;
    }
    let cancelled = false;
    getMyContestTeam(contest.id)
      .then((t) => !cancelled && setMyTeam(t))
      .catch(() => !cancelled && setMyTeam(null));
    return () => {
      cancelled = true;
    };
  }, [user, contest.id]);

  const [claimPlayer, setClaimPlayer] = useState<{ playerId: string; playerName: string } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const pending = claims.filter((c) => c.status === 'pending');
  const history = claims.filter((c) => c.status !== 'pending');

  const handleCancel = async (claimId: string) => {
    setCancellingId(claimId);
    setCancelError(null);
    try {
      await cancelWaiverClaim(claimId);
      await refresh();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Could not cancel this claim.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <h2 className="m-0 font-display italic text-[26px] lg:text-[30px] font-bold tracking-[-0.02em] leading-[0.95] text-ink">
        Waivers
      </h2>

      {/* ── My claims ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h3 className="font-tight text-[11px] font-bold tracking-[0.16em] uppercase text-muted">My claims</h3>
        {!myTeam ? (
          <div className="bg-surface rounded-card-lg shadow-card py-6 text-center">
            <p className="font-tight text-[14px] text-muted">Build a team to place waiver claims.</p>
          </div>
        ) : loading ? (
          <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
            <div className="inline-block w-5 h-5 rounded-full border-2 border-ink/15 border-t-accent animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <>
            {pending.length === 0 ? (
              <p className="text-center font-tight text-[13px] text-faint py-4">No pending claims.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {pending.map((claim) => (
                  <ClaimCard
                    key={claim.id}
                    claim={claim}
                    cancelling={cancellingId === claim.id}
                    onCancel={() => handleCancel(claim.id)}
                  />
                ))}
              </div>
            )}
            {cancelError && (
              <p className="font-tight text-[12px] text-live" role="alert">
                {cancelError}
              </p>
            )}
            {history.length > 0 && (
              <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
                {history.map((claim, idx) => (
                  <div key={claim.id} className={['px-5 py-3 flex flex-col gap-1', idx > 0 ? 'border-t border-hairline' : ''].join(' ')}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-tight text-[14px] font-bold text-ink truncate">
                        {claim.add.playerName}
                        {claim.drop ? ` for ${claim.drop.playerName}` : ''}
                      </span>
                      <span
                        className={[
                          'inline-flex items-center px-2.5 py-1 rounded-full font-tight text-[10px] font-bold tracking-[0.06em] uppercase flex-shrink-0',
                          statusClasses(claim.status),
                        ].join(' ')}
                      >
                        {statusLabel(claim.status)}
                      </span>
                    </div>
                    <span className="font-tight text-[11.5px] text-faint">
                      Bid ${claim.bid} · {formatDateTime(claim.processAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ── On waivers ────────────────────────────────────────────────── */}
      <section>
        <h3 className="font-tight text-[11px] font-bold tracking-[0.16em] uppercase text-muted mb-3">On waivers</h3>
        {loading ? (
          <div className="bg-surface rounded-card-lg shadow-card p-8 text-center">
            <div className="inline-block w-5 h-5 rounded-full border-2 border-ink/15 border-t-accent animate-spin" aria-hidden="true" />
          </div>
        ) : waiverPlayers.length === 0 ? (
          <p className="text-center font-tight text-[13px] text-faint py-4">No players on waivers right now.</p>
        ) : (
          <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
            {waiverPlayers.map((wp, idx) => (
              <div
                key={`${wp.playerLeague}:${wp.playerId}`}
                className={['flex items-center gap-3 px-5 py-3.5', idx > 0 ? 'border-t border-hairline' : ''].join(' ')}
              >
                <div className="min-w-0 flex-1">
                  <span className="block font-tight text-[14px] font-bold text-ink truncate">{wp.playerName}</span>
                  <span className="block font-tight text-[11.5px] text-faint">Clears {formatDateTime(wp.availableAt)}</span>
                </div>
                {myTeam && (
                  <button
                    type="button"
                    onClick={() => setClaimPlayer({ playerId: wp.playerId, playerName: wp.playerName })}
                    className={[
                      'flex-shrink-0 px-4 py-2 rounded-full min-h-[36px]',
                      'bg-accent text-accent-ink font-tight text-[11px] font-bold tracking-[0.04em] uppercase',
                      'hover:opacity-90 transition-opacity duration-150 cursor-pointer',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    ].join(' ')}
                  >
                    Claim
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="font-tight text-[11.5px] text-faint mt-2.5">
          Waiver window is {hours} hours after a player is dropped.
        </p>
      </section>

      {claimPlayer && myTeam && (
        <WaiverClaimDialog
          contest={contest}
          teamId={myTeam.id}
          addPlayer={claimPlayer}
          onClose={() => setClaimPlayer(null)}
          onDone={async () => {
            setClaimPlayer(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function ClaimCard({
  claim,
  cancelling,
  onCancel,
}: {
  claim: WaiverClaim;
  cancelling: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="bg-surface rounded-card-lg shadow-card p-4 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-tight text-[14px] font-bold text-ink truncate">
          {claim.add.playerName}
          {claim.drop ? ` for ${claim.drop.playerName}` : ''}
        </span>
        <span
          className={[
            'inline-flex items-center px-2.5 py-1 rounded-full font-tight text-[10px] font-bold tracking-[0.06em] uppercase flex-shrink-0',
            statusClasses(claim.status),
          ].join(' ')}
        >
          {statusLabel(claim.status)}
        </span>
      </div>
      <p className="font-tight text-[12.5px] text-muted">Bid ${claim.bid}</p>
      <p className="font-tight text-[11.5px] text-faint">Processes {formatDateTime(claim.processAt)}</p>
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelling}
        className={[
          'self-start min-h-[36px] px-4 rounded-full font-tight text-[12px] font-bold cursor-pointer',
          'bg-live/10 text-live hover:bg-live/15 transition-colors duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        ].join(' ')}
      >
        {cancelling ? (
          <span className="inline-block w-4 h-4 rounded-full border-2 border-live/40 border-t-transparent animate-spin align-middle" aria-hidden="true" />
        ) : (
          'Cancel'
        )}
      </button>
    </div>
  );
}

export default WaiversPanel;
