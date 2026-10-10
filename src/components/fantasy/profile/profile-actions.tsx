'use client';

// The team profile's action row: Schedule · Trade · Transactions · Chat.
// Trade is the one place a trade is proposed (Hunter, 2026-10-09). It shows
// on another team's profile in a drafted weekly league once the draft is done,
// and only if the viewer has a team of their own. fantasy_propose_trade
// re-checks all of it.
// The commissioner also gets "Remove from league" on other members' profiles
// (Hunter, 2026-10-09; the league page's Members list is gone).
// fantasy_remove_league_member re-checks the role and refuses the league
// owner. The team itself stays, as when a member leaves.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  getMyContestTeam,
  getMyLeagueRole,
  removeLeagueMember,
  type ContestView,
  type LeagueRole,
} from '@/lib/fantasy/leagues';
import { revalidateFantasyLeague } from '@/app/fantasy/leagues/actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ProposeTradeDialog } from '@/components/fantasy/trades/propose-trade-dialog';

interface TeamOption {
  teamId: string;
  teamName: string;
}

export function ProfileActions({
  contest,
  teamId,
  ownerId,
  ownerName,
  teams,
  tradesOpen,
  showSchedule,
  showTransactions,
}: {
  contest: ContestView;
  teamId: string;
  ownerId: string;
  ownerName: string;
  /** Every team in the contest — the trade dialog's team list. */
  teams: TeamOption[];
  /** Drafted weekly league with the draft complete. */
  tradesOpen: boolean;
  showSchedule: boolean;
  showTransactions: boolean;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const [myTeam, setMyTeam] = useState<TeamOption | null>(null);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [role, setRole] = useState<LeagueRole | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    let cancelled = false;
    getMyLeagueRole(contest.leagueId)
      .then((r) => !cancelled && setRole(r))
      .catch(() => !cancelled && setRole(null));
    return () => {
      cancelled = true;
    };
  }, [user, contest.leagueId]);

  const canRemove = role === 'commissioner' && user != null && user.id !== ownerId && !removed;

  const handleRemove = async () => {
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeLeagueMember(contest.leagueId, ownerId);
      setRemoved(true);
      setRemoveOpen(false);
      await revalidateFantasyLeague(contest.leagueId).catch(() => null);
      router.refresh();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove this member.');
    } finally {
      setRemoving(false);
    }
  };

  useEffect(() => {
    if (!user || !tradesOpen) {
      setMyTeam(null);
      return;
    }
    let cancelled = false;
    getMyContestTeam(contest.id)
      .then((t) => !cancelled && setMyTeam(t ? { teamId: t.id, teamName: t.teamName } : null))
      .catch(() => !cancelled && setMyTeam(null));
    return () => {
      cancelled = true;
    };
  }, [user, tradesOpen, contest.id]);

  const canTrade = tradesOpen && myTeam != null && myTeam.teamId !== teamId;
  const base = `/fantasy/l/${contest.id}`;

  const actions: { key: string; label: string; icon: React.ReactNode; href?: string; onClick?: () => void }[] = [];
  if (showSchedule) actions.push({ key: 'schedule', label: 'Schedule', icon: <CalendarIcon />, href: '#schedule' });
  if (canTrade) actions.push({ key: 'trade', label: 'Trade', icon: <SwapIcon />, onClick: () => setTradeOpen(true) });
  if (showTransactions) actions.push({ key: 'transactions', label: 'Transactions', icon: <ListIcon />, href: '#transactions' });
  actions.push({ key: 'chat', label: 'Chat', icon: <ChatIcon />, href: `${base}/feed` });

  const itemClass = [
    'flex-1 min-w-0 inline-flex items-center justify-center gap-2 min-h-[44px] px-2',
    'font-tight text-[12.5px] font-bold text-ink no-underline cursor-pointer',
    'hover:text-accent transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent rounded-card-sm',
  ].join(' ');

  return (
    <>
      <nav aria-label="Team actions" className="flex items-stretch border-t border-hairline mt-4 pt-1 -mb-1">
        {actions.map((a, idx) => (
          <div key={a.key} className={['flex-1 min-w-0 flex', idx > 0 ? 'border-l border-hairline' : ''].join(' ')}>
            {a.onClick ? (
              <button type="button" onClick={a.onClick} className={itemClass}>
                {a.icon}
                <span className="truncate">{a.label}</span>
              </button>
            ) : (
              <Link href={a.href as string} className={itemClass}>
                {a.icon}
                <span className="truncate">{a.label}</span>
              </Link>
            )}
          </div>
        ))}
      </nav>

      {canRemove && (
        <div className="flex justify-end mt-2 -mb-2">
          <button
            type="button"
            onClick={() => {
              setRemoveError(null);
              setRemoveOpen(true);
            }}
            className={[
              'inline-flex items-center min-h-[44px] px-2 -mr-2 rounded-card-sm',
              'font-tight text-[12px] font-bold text-live hover:opacity-80 transition-opacity duration-150 cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            ].join(' ')}
          >
            Remove from league
          </button>
        </div>
      )}
      {removed && (
        <p role="status" className="m-0 mt-3 font-tight text-[12px] text-muted">
          {ownerName} was removed from the league.
        </p>
      )}

      <ConfirmDialog
        open={removeOpen}
        title="Remove from league?"
        body={`${ownerName} will lose access to this league and its contests. Their team stays in the standings.`}
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={removing}
        error={removeError}
        onConfirm={handleRemove}
        onCancel={() => setRemoveOpen(false)}
      />

      {tradeOpen && myTeam && (
        <ProposeTradeDialog
          contest={contest}
          myTeam={myTeam}
          otherTeams={teams.filter((t) => t.teamId !== myTeam.teamId)}
          initialTeamId={teamId}
          onClose={() => setTradeOpen(false)}
          onDone={() => {
            setTradeOpen(false);
            router.push(`${base}/trades`);
          }}
        />
      )}
    </>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'flex-shrink-0',
};

function CalendarIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg {...iconProps}>
      <path d="M7 7h12l-3-3M17 17H5l3 3" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg {...iconProps}>
      <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...iconProps}>
      <path d="M4 5h16a1 1 0 011 1v9a1 1 0 01-1 1H9l-4.5 4V16H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
    </svg>
  );
}
